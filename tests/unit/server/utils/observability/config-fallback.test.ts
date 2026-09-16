import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consola } from '#shared/utils/logger';
import type { ConfigFallbackEvent, ConfigFallbackReason } from '#shared/types/config-fallback';
import {
  CONFIG_FALLBACK_EVENT,
  CONFIG_FALLBACK_REASONS,
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

describe('the reason enum', () => {
  it('is exactly the five contract values, in contract order', () => {
    expect([...CONFIG_FALLBACK_REASONS]).toEqual([
      'registry-unreachable',
      'registry-row-malformed',
      'site-absent-from-registry',
      'drupal-unreachable',
      'last-known-good-served',
    ]);
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

  it('carries an ISO 8601 UTC timestamp, so the gate can bin events into 5-minute windows', () => {
    recordConfigFallback(base);
    vi.setSystemTime(new Date('2026-09-15T12:06:30.000Z'));
    recordConfigFallback(base);

    const timestamps = emitted().map(record => record.at);

    expect(timestamps).toEqual(['2026-09-15T12:00:00.000Z', '2026-09-15T12:06:30.000Z']);
    timestamps.forEach(at => expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/));
    expect(new Date(timestamps[1]).getTime() - new Date(timestamps[0]).getTime()).toBeGreaterThan(5 * 60_000);
  });
});

describe('runtime rejection of an unknown reason', () => {
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
    expect(warn.mock.calls[0][0]).toContain('dropped an invalid fallback event');
  });

  it('does not throw on a null input', () => {
    expect(() => recordConfigFallback(null as unknown as ConfigFallbackEvent)).not.toThrow();
    expect(emitted()).toHaveLength(0);
  });
});

describe('negative control: no config value can reach the record', () => {
  // Synthetic, obviously-fake, credential-SHAPED fixtures. None is a real value.
  const credentialShaped = [
    'mysql://dummy_user:NOT_A_REAL_PASSWORD@db.invalid:3306/i18n_cache',
    '-----BEGIN PRIVATE KEY-----FAKEFAKEFAKE-----END PRIVATE KEY-----',
    'sk-dummy-0000000000000000000000000000',
    'smtp://dummy:dummy@mail.invalid:587',
    'DUMMYAKIAXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  ];

  it('accepts the short segmented slugs real callers pass', () => {
    ['be', 'prod', 'bl2', 'last-known-good', 'dmsm', 'registry_cache'].forEach((value) => {
      resetConfigFallbackCounts();
      warn.mockClear();
      recordConfigFallback({ ...base, servedFrom: value });

      expect(emitted()).toHaveLength(1);
    });
  });

  it.each(credentialShaped)('rejects a credential-shaped servedFrom (%#) rather than logging it', (value) => {
    recordConfigFallback({ ...base, servedFrom: value });

    expect(emitted()).toHaveLength(0);
    expect(getConfigFallbackCounts()).toHaveLength(0);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(value.slice(0, 24));
  });

  it.each(credentialShaped)('rejects a credential-shaped siteCode (%#)', (value) => {
    recordConfigFallback({ ...base, siteCode: value });

    expect(emitted()).toHaveLength(0);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(value.slice(0, 24));
  });

  it('rejects credential-shaped env and multiSiteCode', () => {
    recordConfigFallback({ ...base, env: 'prod db=NOT_A_REAL_PASSWORD' });
    recordConfigFallback({ ...base, multiSiteCode: 'bl2/../../etc/passwd' });

    expect(emitted()).toHaveLength(0);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('NOT_A_REAL_PASSWORD');
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
