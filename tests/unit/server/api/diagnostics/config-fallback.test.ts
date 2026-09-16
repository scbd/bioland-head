import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { consola } from '#shared/utils/logger';
import {
  recordConfigFallback,
  resetConfigFallbackCounts,
} from '../../../../../server/utils/observability/config-fallback';

/** Headers the handler set, keyed by header name. Cleared before every test. */
const responseHeaders = new Map<string, string>();

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest.
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) =>
  Object.assign(new Error(input.statusMessage), input));
vi.stubGlobal('setResponseHeader', (_event: unknown, name: string, value: string) => {
  responseHeaders.set(name, value);
});

type DiagnosticsEvent = { context?: { me?: Record<string, unknown> } };

let handler: (event: DiagnosticsEvent) => {
  scope: string;
  generatedAt: string;
  logLevel: number;
  counts: Array<Record<string, unknown>>;
};

const asAdmin = { context: { me: { isAdmin: true, roles: ['administrator'] } } };

beforeAll(async () => {
  handler = (await import('../../../../../server/api/diagnostics/config-fallback.get')).default as typeof handler;
});

beforeEach(() => {
  resetConfigFallbackCounts();
  responseHeaders.clear();
  vi.spyOn(consola, 'warn').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetConfigFallbackCounts();
});

describe('GET /api/diagnostics/config-fallback authentication', () => {
  it.each([
    ['no event context at all', {}],
    ['an unresolved user', { context: {} }],
    ['an explicitly absent user', { context: { me: undefined } }],
  ])('rejects %s with 401', (_label, event) => {
    expect(() => handler(event as DiagnosticsEvent)).toThrow(expect.objectContaining({ statusCode: 401 }));
  });

  it.each([
    ['an anonymous resolved user', { isAuthenticated: false, roles: [] }],
    ['a plain authenticated user', { isAuthenticated: true, roles: ['authenticated'] }],
    ['a content manager', { isContentManager: true, roles: ['content_manager'] }],
    ['a site manager', { isSiteManager: true, roles: ['site_manager'] }],
  ])('rejects %s with 403', (_label, me) => {
    expect(() => handler({ context: { me } })).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('never leaks counts on a rejected request', () => {
    recordConfigFallback({
      siteCode: 'be', env: 'prod', multiSiteCode: 'bl2',
      reason: 'registry-unreachable', servedFrom: 'last-known-good',
    });

    let thrown: unknown;

    try { handler({}); } catch (error) { thrown = error; }

    expect(JSON.stringify(thrown ?? {})).not.toContain('registry-unreachable');
  });

  it('serves an administrator', () => {
    expect(() => handler(asAdmin)).not.toThrow();
  });
});

/**
 * The response is admin-only and per-caller. `server/middleware/cache-control.js` would
 * otherwise drop this path into its shared-cacheable default (`max-age=15`,
 * `stale-if-error=1w`, no `private`, no `Vary: Cookie`), which lets an intermediary keying
 * on path alone hand one administrator's body to an anonymous caller. The handler must be
 * correct on its own, not rely on the middleware being amended.
 */
describe('GET /api/diagnostics/config-fallback cacheability', () => {
  it('sets Cache-Control: no-store on the served response', () => {
    handler(asAdmin);

    expect(responseHeaders.get('Cache-Control')).toBe('no-store, max-age=0');
  });

  it('sets no cache header at all on a rejected request', () => {
    expect(() => handler({ context: { me: { isAdmin: false } } })).toThrow();
    expect(responseHeaders.size).toBe(0);
  });
});

describe('GET /api/diagnostics/config-fallback payload', () => {
  it('reports an empty container honestly', () => {
    expect(handler(asAdmin)).toEqual({
      scope: 'container',
      generatedAt: '2026-09-15T12:00:00.000Z',
      logLevel: consola.level,
      counts: [],
    });
  });

  it('reports the effective log level, so an empty aggregate can be told from a muted sink', () => {
    const original = consola.level;

    try {
      consola.level = 0;

      expect(handler(asAdmin).logLevel).toBe(0);
    } finally {
      consola.level = original;
    }
  });

  it('exposes this container counts keyed by env:multiSiteCode:siteCode:reason', () => {
    recordConfigFallback({
      siteCode: 'be', env: 'prod', multiSiteCode: 'bl2',
      reason: 'registry-unreachable', servedFrom: 'last-known-good',
    });
    recordConfigFallback({
      siteCode: 'be', env: 'prod', multiSiteCode: 'bl2',
      reason: 'registry-unreachable', servedFrom: 'last-known-good',
    });
    recordConfigFallback({
      siteCode: 'gt', env: 'prod', multiSiteCode: 'bl2',
      reason: 'site-absent-from-registry', servedFrom: 'dmsm',
    });

    const { counts } = handler(asAdmin);

    expect(counts).toHaveLength(2);
    expect(counts.map(row => row.key).sort()).toEqual([
      'prod:bl2:be:registry-unreachable',
      'prod:bl2:gt:site-absent-from-registry',
    ]);
    expect(counts.find(row => row.siteCode === 'be')).toMatchObject({ count: 2 });
  });

  it('exposes identifiers and tallies only, never a servedFrom-shaped payload field', () => {
    recordConfigFallback({
      siteCode: 'be', env: 'prod', multiSiteCode: 'bl2',
      reason: 'drupal-unreachable', servedFrom: 'last-known-good',
    });

    expect(Object.keys(handler(asAdmin).counts[0]).sort()).toEqual([
      'count', 'env', 'firstAt', 'key', 'lastAt', 'multiSiteCode', 'reason', 'siteCode',
    ]);
  });
});
