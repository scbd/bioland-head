import { describe, it, expect, vi, afterEach } from 'vitest';

// Nitro auto-import the plugin relies on, bound before the plugin is imported.
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin);

const { default: plugin, formatBuildInfo } = await import('~/server/plugins/00.0.build-info');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('formatBuildInfo', () => {
  it('includes the commit and build date when both are set', () => {
    expect(formatBuildInfo({ GIT_COMMIT: 'abc1234', BUILD_DATE: '2026-09-22T12:34:56Z' })).toBe(
      '[startup] head build abc1234 (built 2026-09-22T12:34:56Z)',
    );
  });

  it('falls back to "unknown" for a missing commit', () => {
    expect(formatBuildInfo({ BUILD_DATE: '2026-09-22T12:34:56Z' })).toBe(
      '[startup] head build unknown (built 2026-09-22T12:34:56Z)',
    );
  });

  it('falls back to "unknown" for a missing build date', () => {
    expect(formatBuildInfo({ GIT_COMMIT: 'abc1234' })).toBe('[startup] head build abc1234 (built unknown)');
  });

  it('falls back to "unknown" for both when neither is set', () => {
    expect(formatBuildInfo({})).toBe('[startup] head build unknown (built unknown)');
  });
});

describe('00.0.build-info (Nitro startup logger)', () => {
  it('logs the build line from process.env', () => {
    vi.stubEnv('GIT_COMMIT', 'abc1234');
    vi.stubEnv('BUILD_DATE', '2026-09-22T12:34:56Z');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    (plugin as () => void)();

    expect(infoSpy).toHaveBeenCalledWith('[startup] head build abc1234 (built 2026-09-22T12:34:56Z)');
  });
});
