import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadSafeToDeleteIdentifiers,
  listLocaleEntries,
  registryMismatchReport,
  planRemovals,
  totalPlannedRemovals,
  buildArchiveFragment,
  mergeArchives,
  archivesEqual,
  timestampForFilename,
  stageAndVerifyArchive,
  promoteArchive,
  applyRemovals,
  serializeLocale,
  buildLiteralUsageGrepArgs,
  parseGrepHits,
  run,
  createRealIo,
  KNOWN_UNREGISTERED_LOCALES
} from '../../../../scripts/i18n/remove-resolved-locale-keys.mjs';

/** A minimal fake filesystem so `run()` is exercised without touching disk. */
function makeFakeIo({
  locales,
  manifest,
  registryCodes,
  canonicalArchive,
  dsStore = false
}: {
  locales: Record<string, Record<string, string>>;
  manifest: { records: Array<{ identifier: string; safeToDelete: boolean }> };
  registryCodes: string[];
  canonicalArchive?: Record<string, Record<string, string>>;
  dsStore?: boolean;
}) {
  const files = new Map();
  for (const [code, data] of Object.entries(locales)) files.set(`i18n/locales/${code}.json`, JSON.stringify(data));
  files.set('server/assets/thesaurus-resolvability-manifest.json', JSON.stringify(manifest));
  if (canonicalArchive) files.set('server/assets/thesaurus-label-snapshot.json', JSON.stringify(canonicalArchive));

  const normalize = (p: string) => p.replace(/^.*(i18n\/locales|server\/assets)/, '$1');

  const io = {
    readJson: vi.fn((file: string) => JSON.parse(files.get(normalize(file))!)),
    readDirEntries: vi.fn(() => {
      const entries = Object.keys(locales).map((code) => `${code}.json`);
      return dsStore ? [...entries, '.DS_Store'] : entries;
    }),
    readRegistryCodes: vi.fn(async () => registryCodes),
    existsSync: vi.fn((file: string) => files.has(normalize(file))),
    writeFile: vi.fn((file: string, content: string) => files.set(normalize(file), content)),
    readFile: vi.fn((file: string) => files.get(normalize(file))!),
    mkdir: vi.fn(() => {}),
    rename: vi.fn((from: string, to: string) => {
      files.set(normalize(to), files.get(normalize(from))!);
      files.delete(normalize(from));
    }),
    removeFile: vi.fn((file: string) => files.delete(normalize(file))),
    log: vi.fn()
  };
  return { io, files };
}

describe('loadSafeToDeleteIdentifiers', () => {
  it('keeps only records with safeToDelete === true', () => {
    const manifest = {
      records: [
        { identifier: 'A', safeToDelete: true },
        { identifier: 'B', safeToDelete: false },
        { identifier: 'or', safeToDelete: false }
      ]
    };
    expect(loadSafeToDeleteIdentifiers(manifest)).toEqual(new Set(['A']));
  });

  it('never includes "or" even when present in the manifest, unless explicitly marked safe', () => {
    const manifest = { records: [{ identifier: 'or', safeToDelete: false }] };
    expect(loadSafeToDeleteIdentifiers(manifest).has('or')).toBe(false);
  });

  it('handles an empty/malformed manifest without throwing', () => {
    expect(loadSafeToDeleteIdentifiers({})).toEqual(new Set());
  });
});

describe('listLocaleEntries', () => {
  it('splits .json entries from stray entries and sorts both', () => {
    const result = listLocaleEntries(['fr.json', '.DS_Store', 'ar.json']);
    expect(result).toEqual({ localeFiles: ['ar', 'fr'], strayFiles: ['.DS_Store'] });
  });

  it('reports zero stray files when none exist', () => {
    expect(listLocaleEntries(['en.json']).strayFiles).toEqual([]);
  });
});

describe('registryMismatchReport', () => {
  it('names the on-disk-but-unregistered files explicitly', () => {
    const report = registryMismatchReport(['en', 'fr'], ['en', 'fr', 'no', 'ps', 'ur']);
    expect(report.onDiskButNotRegistered).toEqual(KNOWN_UNREGISTERED_LOCALES);
    expect(report.registeredLocaleCount).toBe(2);
    expect(report.localeFileCount).toBe(5);
  });

  it('reports an empty mismatch list when everything is registered', () => {
    expect(registryMismatchReport(['en'], ['en']).onDiskButNotRegistered).toEqual([]);
  });
});

describe('planRemovals', () => {
  const safeSet = new Set(['A', 'B']);

  it('removes only keys present in a given locale file (check-before-delete)', () => {
    const readLocale = (code: string) => ({ en: { A: '1', B: '2', C: '3' }, fr: { A: '1' } })[code];
    const plan = planRemovals(['en', 'fr'], readLocale, safeSet);
    expect(plan[0]).toMatchObject({ locale: 'en', removed: [{ identifier: 'A', value: '1' }, { identifier: 'B', value: '2' }] });
    expect(plan[1]).toMatchObject({ locale: 'fr', removed: [{ identifier: 'A', value: '1' }] });
  });

  it('does not throw when a locale is missing every manifest key (no.json/ps.json divergence)', () => {
    const readLocale = () => ({ unrelated: 'x' });
    const plan = planRemovals(['no'], readLocale, safeSet);
    expect(plan[0].removed).toEqual([]);
  });

  it('never removes a key absent from the safe set, regardless of shape (the "or" protection)', () => {
    const readLocale = () => ({ or: 'or', A: '1' });
    const plan = planRemovals(['en'], readLocale, new Set(['A'])); // "or" deliberately excluded, like the real manifest
    expect(plan[0].removed.map((r) => r.identifier)).toEqual(['A']);
    expect(plan[0].data.or).toBe('or');
  });
});

describe('totalPlannedRemovals', () => {
  it('sums removals across every locale', () => {
    const plan = [{ removed: [1, 2] }, { removed: [] }, { removed: [3] }] as any;
    expect(totalPlannedRemovals(plan)).toBe(3);
  });
});

describe('buildArchiveFragment', () => {
  it('captures identifier -> locale -> pre-deletion string value', () => {
    const plan = [
      { locale: 'en', removed: [{ identifier: 'A', value: 'Alpha' }] },
      { locale: 'fr', removed: [{ identifier: 'A', value: 'Alpha-fr' }] }
    ];
    expect(buildArchiveFragment(plan)).toEqual({ A: { en: 'Alpha', fr: 'Alpha-fr' } });
  });

  it('ignores a non-string value defensively (malformed locale file)', () => {
    const plan = [{ locale: 'en', removed: [{ identifier: 'A', value: 42 }] }];
    expect(buildArchiveFragment(plan)).toEqual({});
  });
});

describe('mergeArchives', () => {
  it('adds new identifier/locale entries', () => {
    expect(mergeArchives({ A: { en: 'Alpha' } }, { B: { en: 'Beta' } })).toEqual({ A: { en: 'Alpha' }, B: { en: 'Beta' } });
  });

  it('never overwrites an existing entry, even with a differing incoming value', () => {
    const merged = mergeArchives({ A: { en: 'Original' } }, { A: { en: 'Corrupted' } });
    expect(merged.A.en).toBe('Original');
  });

  it('treats an empty base as the identity case', () => {
    expect(mergeArchives({}, { A: { en: 'Alpha' } })).toEqual({ A: { en: 'Alpha' } });
  });

  it('does not mutate its inputs', () => {
    const base = { A: { en: 'Alpha' } };
    mergeArchives(base, { B: { en: 'Beta' } });
    expect(base).toEqual({ A: { en: 'Alpha' } });
  });
});

describe('archivesEqual', () => {
  it('is true for the same data in a different key order', () => {
    expect(archivesEqual({ A: { en: '1' }, B: { en: '2' } }, { B: { en: '2' }, A: { en: '1' } })).toBe(true);
  });

  it('is false when a value differs', () => {
    expect(archivesEqual({ A: { en: '1' } }, { A: { en: '2' } })).toBe(false);
  });
});

describe('timestampForFilename', () => {
  it('produces a filename-safe string with no colons or dots', () => {
    const ts = timestampForFilename(new Date('2026-01-02T03:04:05.678Z'));
    expect(ts).not.toMatch(/[:.]/);
    expect(ts).toBe('2026-01-02T03-04-05-678Z');
  });
});

describe('stageAndVerifyArchive', () => {
  it('writes, reads back, and confirms round-trip equality', () => {
    const files = new Map<string, string>();
    const { stagingPath, serialized } = stageAndVerifyArchive(
      { A: { en: 'Alpha' } },
      {
        writeFile: (f: string, c: string) => files.set(f, c),
        readFile: (f: string) => files.get(f)!,
        mkdir: () => {},
        stagingDir: '/staging'
      }
    );
    expect(stagingPath).toContain('/staging/');
    expect(JSON.parse(serialized)).toEqual({ A: { en: 'Alpha' } });
  });

  it('throws when the round-tripped content does not match (corruption guard)', () => {
    const files = new Map<string, string>();
    expect(() =>
      stageAndVerifyArchive(
        { A: { en: 'Alpha' } },
        {
          writeFile: (f: string) => files.set(f, '{"A":{"en":"CORRUPTED"}}'),
          readFile: (f: string) => files.get(f)!,
          mkdir: () => {},
          stagingDir: '/staging'
        }
      )
    ).toThrow(/round-trip verification failed/);
  });
});

describe('promoteArchive', () => {
  it('writes to a temp path then renames it onto the canonical path (never writes canonical directly)', () => {
    const writeFile = vi.fn();
    const rename = vi.fn();
    promoteArchive('{"A":{}}', { writeFile, rename, canonicalPath: '/canonical.json' });
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [tempPath] = writeFile.mock.calls[0];
    expect(tempPath).not.toBe('/canonical.json');
    expect(rename).toHaveBeenCalledWith(tempPath, '/canonical.json');
  });
});

describe('applyRemovals / serializeLocale', () => {
  it('deletes exactly the planned keys and leaves everything else untouched', () => {
    const entry = { data: { A: '1', B: '2', keep: 'yes' }, removed: [{ identifier: 'A', value: '1' }] };
    const result = applyRemovals(entry);
    expect(result).toEqual({ B: '2', keep: 'yes' });
  });

  it('serializes with 2-space indent and a trailing newline, matching the repo convention', () => {
    expect(serializeLocale({ a: '1' })).toBe('{\n  "a": "1"\n}\n');
  });
});

describe('buildLiteralUsageGrepArgs / parseGrepHits', () => {
  it('excludes i18n/locales and .agents and passes every identifier as a fixed-string pattern', () => {
    const args = buildLiteralUsageGrepArgs(['A', 'B'], '/repo');
    expect(args).toEqual(['-rl', '-F', '-e', 'A', '-e', 'B', '--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=i18n', '--exclude-dir=.agents', '/repo']);
  });

  it('parses newline-separated grep -l output, dropping blank lines', () => {
    expect(parseGrepHits('a/b.vue\nc/d.vue\n\n')).toEqual(['a/b.vue', 'c/d.vue']);
  });

  it('parses an empty (no-hits) grep result to an empty array', () => {
    expect(parseGrepHits('')).toEqual([]);
  });
});

describe('createRealIo', () => {
  it('wires every operation to the real filesystem correctly (round-trip against a temp dir)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p03-05-real-io-'));
    try {
      const io = createRealIo();
      const jsonPath = path.join(dir, 'a.json');
      const textPath = path.join(dir, 'b.txt');
      const subDir = path.join(dir, 'nested');
      const tempPath = path.join(dir, 'temp.json');
      const finalPath = path.join(dir, 'final.json');
      const dsStorePath = path.join(dir, '.DS_Store');

      expect(io.existsSync(jsonPath)).toBe(false);
      io.writeFile(jsonPath, JSON.stringify({ a: 1 }));
      expect(io.existsSync(jsonPath)).toBe(true);
      expect(io.readJson(jsonPath)).toEqual({ a: 1 });
      expect(io.readFile(jsonPath)).toBe(JSON.stringify({ a: 1 }));

      io.mkdir(subDir);
      expect(existsSync(subDir)).toBe(true);

      io.writeFile(tempPath, 'x');
      io.rename(tempPath, finalPath);
      expect(existsSync(tempPath)).toBe(false);
      expect(readFileSync(finalPath, 'utf8')).toBe('x');

      writeFileSync(dsStorePath, '');
      expect(io.readDirEntries(dir).sort()).toEqual(['.DS_Store', 'a.json', 'final.json', 'nested'].sort());
      io.removeFile(dsStorePath);
      expect(existsSync(dsStorePath)).toBe(false);

      expect(() => io.log('quiet in tests, just proving it does not throw')).not.toThrow();
      writeFileSync(textPath, 'irrelevant');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('readRegistryCodes resolves the real i18n/locales.js registry into a flat code list', async () => {
    const codes = await createRealIo().readRegistryCodes();
    expect(Array.isArray(codes)).toBe(true);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes).toContain('en');
  });
});

describe('run (dry run)', () => {
  it('reports planned removals and makes zero writes', async () => {
    const { io } = makeFakeIo({
      locales: { en: { A: '1', or: 'or' }, fr: { A: '1-fr' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }, { identifier: 'or', safeToDelete: false }] },
      registryCodes: ['en', 'fr']
    });

    const report = await run(io, { live: false });

    expect(report.totalRemovals).toBe(2);
    expect(report.live).toBe(false);
    expect(io.writeFile).not.toHaveBeenCalled();
    expect(io.rename).not.toHaveBeenCalled();
  });

  it('names the registry mismatch without acting on it', async () => {
    const { io } = makeFakeIo({
      locales: { en: { A: '1' }, no: { A: '1' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }] },
      registryCodes: ['en']
    });
    const report = await run(io, { live: false });
    expect(report.registryMismatch.onDiskButNotRegistered).toEqual(['no']);
  });
});

describe('run (live)', () => {
  it('archives before deleting, verifies the archive, then removes exactly the planned keys', async () => {
    const { io, files } = makeFakeIo({
      locales: { en: { A: '1', or: 'or' }, fr: { A: '1-fr' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }, { identifier: 'or', safeToDelete: false }] },
      registryCodes: ['en', 'fr']
    });

    const report = await run(io, { live: true });

    expect(report.totalRemovals).toBe(2);
    expect(JSON.parse(files.get('i18n/locales/en.json')!)).toEqual({ or: 'or' });
    expect(JSON.parse(files.get('i18n/locales/fr.json')!)).toEqual({});
    const archive = JSON.parse(files.get('server/assets/thesaurus-label-snapshot.json')!);
    expect(archive).toEqual({ A: { en: '1', fr: '1-fr' } });
  });

  it('protects "or" — never removed even though it is present, because it is absent from the safe set', async () => {
    const { files } = makeFakeIo({
      locales: { en: { A: '1', or: 'or' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }, { identifier: 'or', safeToDelete: false }] },
      registryCodes: ['en']
    });
    const { io } = makeFakeIo({
      locales: { en: { A: '1', or: 'or' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }, { identifier: 'or', safeToDelete: false }] },
      registryCodes: ['en']
    });
    void files;
    await run(io, { live: true });
    expect(JSON.parse((io.writeFile as any).mock.calls.find(([f]: [string]) => f.endsWith('en.json'))[1]).or).toBe('or');
  });

  it('is idempotent: a second live run finds zero removals and never rewrites the archive', async () => {
    const { io } = makeFakeIo({
      locales: { en: { or: 'or' } }, // A already removed by a prior run
      manifest: { records: [{ identifier: 'A', safeToDelete: true }, { identifier: 'or', safeToDelete: false }] },
      registryCodes: ['en'],
      canonicalArchive: { A: { en: '1' } }
    });

    const report = await run(io, { live: true });

    expect(report.totalRemovals).toBe(0);
    expect(io.writeFile).not.toHaveBeenCalled();
    expect(io.rename).not.toHaveBeenCalled();
  });

  it('merges with an existing archive rather than replacing it', async () => {
    const { io, files } = makeFakeIo({
      locales: { en: { A: '1' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }] },
      registryCodes: ['en'],
      canonicalArchive: { PRIOR: { en: 'kept' } }
    });
    await run(io, { live: true });
    const archive = JSON.parse(files.get('server/assets/thesaurus-label-snapshot.json')!);
    expect(archive).toEqual({ PRIOR: { en: 'kept' }, A: { en: '1' } });
  });

  it('leaves .DS_Store in place and reports it when not confirmed', async () => {
    const { io, files } = makeFakeIo({
      locales: { en: { A: '1' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }] },
      registryCodes: ['en'],
      dsStore: true
    });
    const report = await run(io, { live: true, confirmDsStore: false });
    expect(report.dsStore).toEqual({ present: true, removed: false });
    expect(files.has('i18n/locales/.DS_Store')).toBe(false); // never existed as file content; presence is directory-listing-only in this fake
    expect(io.removeFile).not.toHaveBeenCalled();
  });

  it('removes .DS_Store only when explicitly confirmed for this run', async () => {
    const { io } = makeFakeIo({
      locales: { en: { A: '1' } },
      manifest: { records: [{ identifier: 'A', safeToDelete: true }] },
      registryCodes: ['en'],
      dsStore: true
    });
    const report = await run(io, { live: true, confirmDsStore: true });
    expect(report.dsStore).toEqual({ present: true, removed: true });
    expect(io.removeFile).toHaveBeenCalledWith(expect.stringContaining('.DS_Store'));
  });
});
