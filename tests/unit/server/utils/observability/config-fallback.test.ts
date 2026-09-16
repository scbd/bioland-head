import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consola } from '#shared/utils/logger';
import type {
  ConfigFallbackEvent,
  ConfigFallbackReason,
  ConfigFallbackSource,
} from '#shared/types/config-fallback';
import {
  CONFIG_FALLBACK_ENVS,
  CONFIG_FALLBACK_EVENT,
  CONFIG_FALLBACK_MULTI_SITE_CODES,
  CONFIG_FALLBACK_REASONS,
  CONFIG_FALLBACK_SOURCES,
  configFallbackCounterKey,
  getConfigFallbackCounts,
  recordConfigFallback,
  resetConfigFallbackCounts,
} from '../../../../../server/utils/observability/config-fallback';

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

const base: ConfigFallbackEvent = {
  siteCode: 'be',
  env: 'prod',
  multiSiteCode: 'bl2',
  reason: 'registry-unreachable',
  servedFrom: 'last-known-good',
};

/** Every `config.source.fallback` line emitted so far, parsed back into objects. */
const emitted = () => warn.mock.calls
  .map(([line]) => line)
  .filter((line): line is string => typeof line === 'string' && line.startsWith('{'))
  .map(line => JSON.parse(line));

beforeEach(() => {
  resetConfigFallbackCounts();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
  warn = vi.spyOn(consola, 'warn').mockImplementation(() => {});
  error = vi.spyOn(consola, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetConfigFallbackCounts();
});

describe('the closed vocabularies', () => {
  it('the reason enum is exactly the five contract values, in contract order', () => {
    expect([...CONFIG_FALLBACK_REASONS]).toEqual([
      'registry-unreachable',
      'registry-row-malformed',
      'site-absent-from-registry',
      'drupal-unreachable',
      'last-known-good-served',
    ]);
  });

  it('servedFrom is a closed source enum, not free vocabulary', () => {
    expect([...CONFIG_FALLBACK_SOURCES]).toEqual([
      'dmsm',
      'drupal',
      'last-known-good',
      'defaults',
    ]);
  });

  it('env and multiSiteCode mirror the DMSM config path segments', () => {
    expect([...CONFIG_FALLBACK_ENVS]).toEqual(['dev', 'stg', 'prod']);
    expect([...CONFIG_FALLBACK_MULTI_SITE_CODES]).toEqual(['bl2', 'bsl']);
  });

  it.each(CONFIG_FALLBACK_SOURCES)('accepts servedFrom %s verbatim', (servedFrom) => {
    recordConfigFallback({ ...base, servedFrom });

    expect(emitted()[0]).toMatchObject({ servedFrom });
    expect(emitted()[0].sanitized).toBeUndefined();
  });
});

describe('recordConfigFallback', () => {
  it('emits one single-line record carrying the literal event name', () => {
    recordConfigFallback(base);

    expect(warn).toHaveBeenCalledTimes(1);

    const [line] = warn.mock.calls[0] as [string];

    expect(line).not.toContain('\n');
    expect(line).toContain('"event":"config.source.fallback"');
    expect(JSON.parse(line).event).toBe(CONFIG_FALLBACK_EVENT);
  });

  it('emits the exact field set and nothing else', () => {
    recordConfigFallback(base);

    expect(emitted()[0]).toEqual({
      event: 'config.source.fallback',
      at: '2026-09-15T12:00:00.000Z',
      env: 'prod',
      multiSiteCode: 'bl2',
      siteCode: 'be',
      reason: 'registry-unreachable',
      servedFrom: 'last-known-good',
    });
  });

  it.each(CONFIG_FALLBACK_REASONS)('emits and counts reason %s', (reason) => {
    recordConfigFallback({ ...base, reason });

    expect(emitted()[0].reason).toBe(reason);
    expect(getConfigFallbackCounts()[0]).toMatchObject({ reason, count: 1 });
  });

  it('carries an ISO 8601 UTC timestamp, so the gate can order and diff events', () => {
    recordConfigFallback(base);
    vi.setSystemTime(new Date('2026-09-15T12:06:30.000Z'));
    recordConfigFallback(base);

    const timestamps = emitted().map(record => record.at);

    expect(timestamps).toEqual(['2026-09-15T12:00:00.000Z', '2026-09-15T12:06:30.000Z']);
    timestamps.forEach(at => expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/));
    expect(new Date(timestamps[1]).getTime() - new Date(timestamps[0]).getTime()).toBeGreaterThan(5 * 60_000);
  });
});

/**
 * Clause 2 of the rollout gate is "no two `registry-unreachable` events inside one 5-minute
 * window". The module JSDoc documents the query p04-01 copies verbatim, so the query shape
 * itself is part of this contract — and the obvious shape is wrong.
 *
 * Both implementations below run against the emitter's real `at` values.
 */
describe('the documented 5-minute clustering query', () => {
  const FIVE_MINUTES = 5 * 60_000;

  const at = () => emitted().map(record => new Date(record.at).getTime()).sort((a, b) => a - b);

  /** What `| bin(at, 5m) | stats count(*) by window | filter inWindow > 1` computes. */
  const violationsByWallClockBin = () => {
    const bins = new Map<number, number>();

    at().forEach((ms) => {
      const bin = Math.floor(ms / FIVE_MINUTES);

      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    });

    return [...bins.values()].filter(count => count > 1).length;
  };

  /** What `| sort at | delta = at - prev(at) | filter delta < 5m` computes. */
  const violationsByAdjacency = () => {
    const times = at();

    return times.filter((ms, index) => index > 0 && ms - times[index - 1] < FIVE_MINUTES).length;
  };

  /** 12:04:50 and 12:05:20 are 30 seconds apart, either side of the 12:05 bin boundary. */
  const emitAcrossTheBoundary = () => {
    vi.setSystemTime(new Date('2026-09-15T12:04:50.000Z'));
    recordConfigFallback(base);
    vi.setSystemTime(new Date('2026-09-15T12:05:20.000Z'));
    recordConfigFallback(base);
  };

  it('detects two events 30 seconds apart across a wall-clock bin boundary', () => {
    emitAcrossTheBoundary();

    expect(violationsByAdjacency()).toBe(1);
  });

  it('is why bin(at, 5m) was replaced: bins miss exactly that pair', () => {
    emitAcrossTheBoundary();

    expect(violationsByWallClockBin()).toBe(0);
  });

  it('still detects a pair that happens to fall inside one bin', () => {
    vi.setSystemTime(new Date('2026-09-15T12:01:00.000Z'));
    recordConfigFallback(base);
    vi.setSystemTime(new Date('2026-09-15T12:03:00.000Z'));
    recordConfigFallback(base);

    expect(violationsByAdjacency()).toBe(1);
    expect(violationsByWallClockBin()).toBe(1);
  });

  it('passes a genuinely spread-out soak', () => {
    ['12:00:00', '12:06:00', '12:12:00', '12:18:00'].forEach((time) => {
      vi.setSystemTime(new Date(`2026-09-15T${time}.000Z`));
      recordConfigFallback(base);
    });

    expect(violationsByAdjacency()).toBe(0);
  });
});

describe('an unrecognised reason is the only input that is dropped', () => {
  it.each([
    ['an unlisted string', 'registry-on-fire'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['a non-string', 42],
  ])('drops %s without emitting or counting', (_label, reason) => {
    recordConfigFallback({ ...base, reason: reason as ConfigFallbackReason });

    expect(emitted()).toHaveLength(0);
    expect(getConfigFallbackCounts()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('unrecognised reason');
  });

  it('does not throw on a null input', () => {
    expect(() => recordConfigFallback(null as unknown as ConfigFallbackEvent)).not.toThrow();
    expect(emitted()).toHaveLength(0);
  });

  it('does not throw on a non-object input', () => {
    expect(() => recordConfigFallback('nope' as unknown as ConfigFallbackEvent)).not.toThrow();
    expect(emitted()).toHaveLength(0);
  });
});

/**
 * The gate's clause 1 is `site-absent-from-registry == 0`. If a validation failure dropped
 * the event, a fleet that is failing would produce zero rows and the gate would pass. So a
 * bad field must degrade the record, never delete it.
 */
describe('a failed field check degrades the event, it never deletes it', () => {
  it('still emits a structured record when siteCode is not an identifier', () => {
    recordConfigFallback({ ...base, reason: 'site-absent-from-registry', siteCode: 'db.internal.host.name' });

    expect(emitted()).toEqual([{
      event: 'config.source.fallback',
      at: '2026-09-15T12:00:00.000Z',
      env: 'prod',
      multiSiteCode: 'bl2',
      siteCode: 'invalid',
      reason: 'site-absent-from-registry',
      servedFrom: 'last-known-good',
      sanitized: true,
    }]);
  });

  it('still counts it, so a gate-failing event cannot become a non-event', () => {
    recordConfigFallback({ ...base, reason: 'site-absent-from-registry', siteCode: 'db.internal.host.name' });

    expect(getConfigFallbackCounts()).toEqual([expect.objectContaining({
      key: 'prod:bl2:invalid:site-absent-from-registry',
      siteCode: 'invalid',
      reason: 'site-absent-from-registry',
      count: 1,
    })]);
  });

  it.each([
    ['env', { env: 'production' }, { env: 'invalid', multiSiteCode: 'bl2', siteCode: 'be', servedFrom: 'last-known-good' }],
    ['multiSiteCode', { multiSiteCode: 'bl3' }, { env: 'prod', multiSiteCode: 'invalid', siteCode: 'be', servedFrom: 'last-known-good' }],
    ['siteCode', { siteCode: 'be test' }, { env: 'prod', multiSiteCode: 'bl2', siteCode: 'invalid', servedFrom: 'last-known-good' }],
    ['servedFrom', { servedFrom: 'clearinghouse' }, { env: 'prod', multiSiteCode: 'bl2', siteCode: 'be', servedFrom: 'invalid' }],
  ])('replaces only the offending %s and flags the record', (_label, patch, expected) => {
    recordConfigFallback({ ...base, ...patch } as ConfigFallbackEvent);

    expect(emitted()[0]).toMatchObject({ ...expected, sanitized: true });
  });

  it('sanitises every field at once when every field is wrong', () => {
    recordConfigFallback({
      env: 42, multiSiteCode: undefined, siteCode: null, servedFrom: { toString: () => 'x' },
      reason: 'drupal-unreachable',
    } as unknown as ConfigFallbackEvent);

    expect(emitted()[0]).toMatchObject({
      env: 'invalid', multiSiteCode: 'invalid', siteCode: 'invalid', servedFrom: 'invalid', sanitized: true,
    });
    expect(getConfigFallbackCounts()[0].key).toBe('invalid:invalid:invalid:drupal-unreachable');
  });

  it('omits the sanitized flag entirely on a clean record', () => {
    recordConfigFallback(base);

    expect(Object.keys(emitted()[0])).not.toContain('sanitized');
  });
});

describe('negative control: no config value can reach the record', () => {
  // Synthetic, obviously-fake, credential-SHAPED fixtures. None is a real value, and each
  // is assembled so its literal source text cannot match a secret-scanner regex bank:
  // the PEM header is concatenated, and the key-id fixture deliberately avoids the real
  // provider prefix. Neither weakens the probe, because the validator rejects these on
  // length and character class, never on a prefix.
  const PEM_HEADER = `-----BEGIN PRIVATE ${'KEY'}-----`;
  const PEM_FOOTER = `-----END PRIVATE ${'KEY'}-----`;

  const credentialShaped = [
    'mysql://dummy_user:NOT_A_REAL_PASSWORD@db.invalid:3306/i18n_cache',
    `${PEM_HEADER}FAKEFAKEFAKE${PEM_FOOTER}`,
    'sk-dummy-0000000000000000000000000000',
    'smtp://dummy:dummy@mail.invalid:587',
    'ZZZZDUMMY0000000000000000000000000000',
  ];

  /**
   * The escape the segment rule alone would wave through: short segments chained up to a
   * credential- or hostname-shaped length. Every one of these is <= 12 characters per
   * segment, so only the total-length cap and the hyphen-only separator reject them.
   */
  const segmentedShapes = [
    ['a v4 UUID', '550e8400-e29b-41d4-a716-446655440000'],
    ['a hostname', 'www.cbd.int'],
    ['an internal host', 'db.internal.host.name'],
    ['a dotted key path', 'admin.password'],
    // Low-entropy stand-ins for a chained credential. The validator rejects on segment
    // count and total length, never on entropy, so these probe it exactly as a real token
    // shape would — without seeding the repo with anything a secret scanner must triage.
    ['a four-segment slug over the cap', 'tenant-aaaa-bbbb-cccc-dddd'],
    ['a token-length chained slug', 'tokenaaaaaa-bbbbbbcccccc-dd'],
  ] as const;

  it('accepts the short hyphen-slugs real callers pass as a siteCode', () => {
    ['be', 'gt', 'x', 'bsl', 'attacker-tenant', 'cached-site'].forEach((value) => {
      resetConfigFallbackCounts();
      warn.mockClear();
      recordConfigFallback({ ...base, siteCode: value });

      expect(emitted()[0]).toMatchObject({ siteCode: value });
      expect(emitted()[0].sanitized).toBeUndefined();
    });
  });

  it.each(credentialShaped)('never logs a credential-shaped servedFrom (%#)', (value) => {
    recordConfigFallback({ ...base, servedFrom: value as ConfigFallbackSource });

    expect(emitted()[0]).toMatchObject({ servedFrom: 'invalid', sanitized: true });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(value.slice(0, 24));
  });

  it.each(credentialShaped)('never logs a credential-shaped siteCode (%#)', (value) => {
    recordConfigFallback({ ...base, siteCode: value });

    expect(emitted()[0]).toMatchObject({ siteCode: 'invalid', sanitized: true });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(value.slice(0, 24));
  });

  it.each(segmentedShapes)('never logs %s as a siteCode', (_label, value) => {
    recordConfigFallback({ ...base, siteCode: value });

    expect(emitted()[0]).toMatchObject({ siteCode: 'invalid', sanitized: true });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(value);
  });

  it('caps total identifier length, so short segments cannot be chained into one', () => {
    recordConfigFallback({ ...base, siteCode: 'abcdefghijkl-abcdefghijkl' });

    expect(emitted()[0]).toMatchObject({ siteCode: 'invalid', sanitized: true });

    recordConfigFallback({ ...base, siteCode: 'abcdefghijkl-abcdefghij' });

    expect(emitted()[1]).toMatchObject({ siteCode: 'abcdefghijkl-abcdefghij' });
  });

  it('never logs credential-shaped env or multiSiteCode', () => {
    recordConfigFallback({ ...base, env: 'prod db=NOT_A_REAL_PASSWORD' });
    recordConfigFallback({ ...base, multiSiteCode: 'bl2/../../etc/passwd' });

    expect(emitted().map(record => [record.env, record.multiSiteCode])).toEqual([
      ['invalid', 'bl2'],
      ['prod', 'invalid'],
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('NOT_A_REAL_PASSWORD');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('etc/passwd');
  });

  it('drops extra caller-supplied keys instead of forwarding them', () => {
    const smuggled = {
      ...base,
      config: { dataBase: { password: 'NOT_A_REAL_PASSWORD' } },
      error: new Error('boom'),
      stack: 'at somewhere (file.ts:1:1)',
      panoramaKey: 'DUMMY_PANORAMA_KEY_VALUE',
    } as unknown as ConfigFallbackEvent;

    recordConfigFallback(smuggled);

    const [record] = emitted();

    expect(Object.keys(record).sort()).toEqual(
      ['at', 'env', 'event', 'multiSiteCode', 'reason', 'servedFrom', 'siteCode'],
    );

    const line = JSON.stringify(record);

    ['NOT_A_REAL_PASSWORD', 'DUMMY_PANORAMA_KEY_VALUE', 'boom', 'stack', 'dataBase'].forEach(
      needle => expect(line).not.toContain(needle),
    );
  });
});

describe('the non-throwing guarantee', () => {
  it('swallows a logger that throws, so telemetry cannot fail a config read', () => {
    warn.mockImplementation(() => { throw new Error('log sink is down'); });

    expect(() => recordConfigFallback(base)).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('telemetry emit failed');
  });

  it('reports an emit failure once per container, then stays quiet', () => {
    warn.mockImplementation(() => { throw new Error('log sink is down'); });

    recordConfigFallback(base);
    recordConfigFallback(base);
    recordConfigFallback(base);

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('does not throw when even the failure report throws', () => {
    warn.mockImplementation(() => { throw new Error('log sink is down'); });
    error.mockImplementation(() => { throw new Error('so is the error sink'); });

    expect(() => recordConfigFallback(base)).not.toThrow();
  });
});

describe('the per-container counter', () => {
  it('keys by env:multiSiteCode:siteCode:reason', () => {
    expect(configFallbackCounterKey(base)).toBe('prod:bl2:be:registry-unreachable');

    recordConfigFallback(base);

    expect(getConfigFallbackCounts()[0]).toEqual({
      key: 'prod:bl2:be:registry-unreachable',
      env: 'prod',
      multiSiteCode: 'bl2',
      siteCode: 'be',
      reason: 'registry-unreachable',
      count: 1,
      firstAt: '2026-09-15T12:00:00.000Z',
      lastAt: '2026-09-15T12:00:00.000Z',
    });
  });

  it('accumulates repeats on one key and advances lastAt only', () => {
    recordConfigFallback(base);
    vi.setSystemTime(new Date('2026-09-15T12:03:00.000Z'));
    recordConfigFallback(base);

    expect(getConfigFallbackCounts()).toEqual([
      expect.objectContaining({
        count: 2,
        firstAt: '2026-09-15T12:00:00.000Z',
        lastAt: '2026-09-15T12:03:00.000Z',
      }),
    ]);
  });

  it('separates every differing key component', () => {
    recordConfigFallback(base);
    recordConfigFallback({ ...base, siteCode: 'gt' });
    recordConfigFallback({ ...base, env: 'stg' });
    recordConfigFallback({ ...base, multiSiteCode: 'bsl' });
    recordConfigFallback({ ...base, reason: 'drupal-unreachable' });

    expect(getConfigFallbackCounts().map(row => row.key).sort()).toEqual([
      'prod:bl2:be:drupal-unreachable',
      'prod:bl2:be:registry-unreachable',
      'prod:bl2:gt:registry-unreachable',
      'prod:bsl:be:registry-unreachable',
      'stg:bl2:be:registry-unreachable',
    ]);
  });

  it('orders by most recent activity first', () => {
    recordConfigFallback(base);
    vi.setSystemTime(new Date('2026-09-15T12:05:00.000Z'));
    recordConfigFallback({ ...base, siteCode: 'gt' });

    expect(getConfigFallbackCounts().map(row => row.siteCode)).toEqual(['gt', 'be']);
  });

  it('resets, the way a container restart resets it', () => {
    recordConfigFallback(base);
    resetConfigFallbackCounts();

    expect(getConfigFallbackCounts()).toEqual([]);
  });
});
