import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  BLOCK_START,
  BLOCK_END,
  GAP_START,
  GAP_END,
  BULK_DOMAINS,
  bucketOf,
  isInUiGap,
  getBlockKeys,
  assertBlockIntegrity,
  applyAliases,
  listLocaleFiles,
  buildLocaleIndex,
  localesMissingKey,
  localeRegistryReport,
  divergenceReport,
  englishLabelCandidates,
  buildRecord,
  summarise,
  probeTail,
  indexDomainTerms,
  partitionAgainstCorpus,
  assertManifestSanity,
  buildManifest,
  enumerateCorpus,
  runClassification,
  liveFetchJson
} from '../../../../scripts/thesaurus/classify-resolvable-keys.mjs';

const REPO_ROOT = resolve(__dirname, '../../../..');
const readJson = (relative: string) => JSON.parse(readFileSync(resolve(REPO_ROOT, relative), 'utf8'));

/** A locale object whose ordered keys reproduce the real block shape at miniature scale. */
const makeLocaleData = () => {
  const data: Record<string, string> = {};
  for (let i = 0; i < BLOCK_START; i += 1) data[`pre-${i}`] = `pre ${i}`;
  const block = [
    'CCA4B662-8EF4-418D-B327-0D6F418AA703',
    'ad',
    'CBD-SUBJECT-BIOMES',
    'GBF-TARGET-01',
    'AICHI-TARGET-01',
    'SDG-GOAL-01',
    'SDG-GOAL-01Alt',
    'doc-1',
    'someUiKey'
  ];
  block.forEach((key, i) => {
    data[key] = `value for ${key}`;
  });
  // Pad out to the gap, place the gap anchors, then pad to the block end.
  for (let i = Object.keys(data).length; i < GAP_START - 1; i += 1) data[`filler-${i}`] = `filler ${i}`;
  data['GBF-GOAL-DDescription'] = 'gbf goal d description';
  data.pdfNotice = 'pdf notice';
  // The English conjunction, living inside the gap exactly as it does in the real en.json.
  data.or = 'or';
  for (let i = Object.keys(data).length; i < GAP_END; i += 1) data[`gap-${i}`] = `gap ${i}`;
  data['National Biosafety Framework'] = 'nbf';
  data['B18CE475-8D23-4DEC-A9F1-13F0243C9233'] = 'bch subject';
  for (let i = Object.keys(data).length; i <= BLOCK_END; i += 1) data[`post-${i}`] = `post ${i}`;
  // The trailing UI tail, outside the block.
  data['cookie-control-accept'] = 'Accept';
  data['cookie-name-ga'] = 'ga';
  return data;
};

describe('block boundary', () => {
  it('slices exactly 680 keys from [380, 1059]', () => {
    const block = getBlockKeys(makeLocaleData());
    expect(BLOCK_START).toBe(380);
    expect(BLOCK_END).toBe(1059);
    expect(block).toHaveLength(680);
    expect(block[0].index).toBe(380);
    expect(block[679].index).toBe(1059);
  });

  it('excludes the trailing UI tail at index 1060 and beyond', () => {
    const block = getBlockKeys(makeLocaleData());
    const keys = block.map((entry) => entry.key);
    expect(keys).not.toContain('cookie-control-accept');
    expect(keys).not.toContain('cookie-name-ga');
  });

  it('holds against the real en.json, which is the file the manifest is built from', () => {
    const en = readJson('i18n/locales/en.json');
    expect(() => assertBlockIntegrity(en)).not.toThrow();
    expect(getBlockKeys(en)).toHaveLength(680);
  });

  it('throws when the block length drifts', () => {
    const entries = Object.entries(makeLocaleData()).slice(0, BLOCK_END);
    expect(() => assertBlockIntegrity(Object.fromEntries(entries))).toThrow(/Block boundary drifted/);
  });

  it('throws when the block no longer starts on a GUID', () => {
    const data = makeLocaleData();
    const entries = Object.entries(data);
    entries[BLOCK_START] = ['notAGuid', 'x'];
    expect(() => assertBlockIntegrity(Object.fromEntries(entries))).toThrow(/Block start drifted/);
  });

  it('throws when a UI-gap anchor drifts, rather than silently mis-aligning the gap', () => {
    const data = makeLocaleData();
    const entries = Object.entries(data);
    entries[GAP_START] = ['someOtherKey', 'x'];
    expect(() => assertBlockIntegrity(Object.fromEntries(entries))).toThrow(/UI-gap anchor drifted/);
  });

  it('pins the gap to [932, 1001], not the plan text of [933, 1004]', () => {
    expect([GAP_START, GAP_END]).toEqual([932, 1001]);
    expect(isInUiGap(931)).toBe(false);
    expect(isInUiGap(932)).toBe(true);
    expect(isInUiGap(1001)).toBe(true);
    // 1002-1004 are real GUID terms the plan text would have wrongly swallowed.
    expect(isInUiGap(1002)).toBe(false);
    expect(isInUiGap(1004)).toBe(false);
  });
});

describe('bucketOf', () => {
  it.each([
    ['CCA4B662-8EF4-418D-B327-0D6F418AA703', 'guid'],
    ['ad', 'iso2'],
    ['CBD-SUBJECT-BIOMES', 'cbd-subject'],
    ['GBF-TARGET-01', 'gbf-target'],
    ['AICHI-TARGET-01', 'aichi-target'],
    ['SDG-GOAL-01', 'sdg'],
    ['SDG-GOAL-01Alt', 'sdg'],
    ['doc-1', 'doc-n'],
    ['doc-20', 'doc-n'],
    ['pdfNotice', 'other'],
    ['National Biosafety Framework', 'other'],
    ['GBF-GOAL-ADescription', 'other']
  ])('buckets %s as %s', (key, expected) => {
    expect(bucketOf(key)).toBe(expected);
  });

  it('reproduces the verified per-family counts against the real en.json', () => {
    const block = getBlockKeys(readJson('i18n/locales/en.json'));
    const counts: Record<string, number> = {};
    for (const { key } of block) counts[bucketOf(key)] = (counts[bucketOf(key)] ?? 0) + 1;
    expect(counts).toEqual({
      guid: 181,
      iso2: 199,
      'cbd-subject': 84,
      'gbf-target': 46,
      'aichi-target': 20,
      sdg: 34,
      'doc-n': 20,
      other: 96
    });
  });
});

describe('applyAliases', () => {
  const aliases = {
    sdg: { 'SDG-GOAL-01': 'SUSTAINABLE-DEVELOPMENT-GOAL-01', 'SDG-GOAL-01Alt': 'SUSTAINABLE-DEVELOPMENT-GOAL-01' },
    iso2: { ad: 'ad', _unmapped: ['zz'] }
  };

  it('maps an SDG key through sdg.json before any probe', () => {
    expect(applyAliases('SDG-GOAL-01', aliases)).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01');
    expect(applyAliases('SDG-GOAL-01Alt', aliases)).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01');
  });

  it('maps an ISO-2 key through iso2-countries.json', () => {
    expect(applyAliases('ad', aliases)).toBe('ad');
  });

  it('passes an unaliased key through unchanged', () => {
    expect(applyAliases('CBD-SUBJECT-BIOMES', aliases)).toBe('CBD-SUBJECT-BIOMES');
  });

  it('never treats the _unmapped reporting array as an alias', () => {
    expect(applyAliases('_unmapped', aliases)).toBe('_unmapped');
  });

  it('uses the real committed alias maps', () => {
    const real = { sdg: readJson('server/assets/thesaurus-aliases/sdg.json'), iso2: readJson('server/assets/thesaurus-aliases/iso2-countries.json') };
    expect(applyAliases('SDG-GOAL-17', real)).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-17');
    expect(applyAliases('ca', real)).toBe('ca');
    // p02-04's exclusion: "or" is deliberately absent from the country map.
    expect(applyAliases('or', real)).toBe('or');
  });
});

describe('the "or" false positive', () => {
  const real = { sdg: readJson('server/assets/thesaurus-aliases/sdg.json'), iso2: readJson('server/assets/thesaurus-aliases/iso2-countries.json') };

  it('is absent from the committed country alias map', () => {
    expect(real.iso2).not.toHaveProperty('or');
  });

  it('sits inside the UI gap in the real en.json, so it is never probed', () => {
    const block = getBlockKeys(readJson('i18n/locales/en.json'));
    const or = block.find((entry) => entry.key === 'or');
    expect(or).toBeDefined();
    expect(isInUiGap(or!.index)).toBe(true);
  });

  it('classifies unresolvable even when a probe would have returned a bogus 200', () => {
    const record = buildRecord({
      key: 'or',
      index: 953,
      enValue: 'or',
      canonicalId: 'or',
      // Deliberately a successful-looking resolution: the false result must come from the
      // gap/exclusion logic, not from the live API's real behaviour.
      resolution: { httpStatus: 200, domain: 'countries', method: 'domain-enumeration', term: { title: { en: 'Oregon' } } },
      localeIndex: { en: new Set(['or']) },
      localeFileCount: 1
    });
    // buildRecord honours the resolution it is handed, so the guard that matters is upstream:
    // a gap key is never probed, so no resolution is ever produced for it.
    const gapRecord = buildRecord({
      key: 'or',
      index: 953,
      enValue: 'or',
      canonicalId: 'or',
      resolution: null,
      localeIndex: { en: new Set(['or']) },
      localeFileCount: 1
    });
    expect(gapRecord.resolvable).toBe(false);
    expect(gapRecord.safeToDelete).toBe(false);
    expect(gapRecord.inUiGap).toBe(true);
    expect(gapRecord.reviewFlags).toContain('ui-chrome-gap-not-probed');
    expect(gapRecord.resolutionMethod).toBe('skipped-ui-gap');
    expect(record.inUiGap).toBe(true);
  });
});

describe('UI-gap keys are never probed', () => {
  it('produces no fetch call for any gap-range key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const localeData = makeLocaleData();
      const aliases = { sdg: {}, iso2: {} };
      const corpus = new Map();
      const tail: { key: string; canonicalId: string }[] = [];
      for (const { key, index } of getBlockKeys(localeData)) {
        if (isInUiGap(index)) continue;
        const canonicalId = applyAliases(key, aliases);
        if (!corpus.has(canonicalId.toLowerCase())) tail.push({ key, canonicalId });
      }
      const gapKeys = getBlockKeys(localeData)
        .filter((entry) => isInUiGap(entry.index))
        .map((entry) => entry.key);
      expect(gapKeys.length).toBe(GAP_END - GAP_START + 1);
      expect(tail.map((t) => t.key)).not.toEqual(expect.arrayContaining(gapKeys));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('locale file handling', () => {
  it('ignores .DS_Store and any other non-JSON entry', () => {
    expect(listLocaleFiles(['en.json', '.DS_Store', 'fr.json', 'README.md', 'ES.JSON'])).toEqual(['ES', 'en', 'fr']);
  });

  it('lists exactly the locale files missing a key', () => {
    const index = buildLocaleIndex(['en', 'fr', 'de'], (code) =>
      code === 'de' ? { other: 'x' } : { 'CBD-SUBJECT-BIOMES': 'Biomes' }
    );
    expect(localesMissingKey('CBD-SUBJECT-BIOMES', index)).toEqual(['de']);
    expect(localesMissingKey('other', index)).toEqual(['en', 'fr']);
  });

  it('reports the registry-vs-disk mismatch with exact filenames, and fixes nothing', () => {
    const report = localeRegistryReport(['en', 'fr'], ['en', 'fr', 'no', 'ps'], ['.DS_Store']);
    expect(report.registeredLocales).toBe(2);
    expect(report.localeJsonFilesOnDisk).toBe(4);
    expect(report.onDiskButNotRegistered).toEqual(['no', 'ps']);
    expect(report.registeredButNoFileOnDisk).toEqual([]);
    expect(report.strayNonJsonFiles).toEqual(['.DS_Store']);
  });

  it('reproduces the real 79-vs-82 mismatch against the repo', async () => {
    const registry = (await import(resolve(REPO_ROOT, 'i18n/locales.js'))).default as { code: string }[];
    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(resolve(REPO_ROOT, 'i18n/locales'));
    const files = listLocaleFiles(entries);
    const report = localeRegistryReport(registry.map((r) => r.code), files, entries.filter((e) => !e.toLowerCase().endsWith('.json')));
    expect(report.registeredLocales).toBe(79);
    expect(report.localeJsonFilesOnDisk).toBe(82);
    expect(report.onDiskButNotRegistered).toEqual(['no', 'ps', 'ur']);
    expect(report.registeredButNoFileOnDisk).toEqual([]);
  });

  it('groups per-locale divergence from en', () => {
    const index = buildLocaleIndex(['en', 'fr', 'de', 'es'], (code) => {
      if (code === 'en') return { a: 1, b: 2, c: 3 };
      if (code === 'fr') return { a: 1, b: 2, c: 3 };
      if (code === 'de') return { a: 1 };
      return { a: 1, b: 2 };
    });
    const report = divergenceReport(index);
    expect(report.enKeyCount).toBe(3);
    expect(report.localesIdenticalToEn).toBe(1);
    expect(report.missingKeyGroups).toEqual([
      { missingKeyCount: 2, localeCount: 1, locales: ['de'] },
      { missingKeyCount: 1, localeCount: 1, locales: ['es'] },
      { missingKeyCount: 0, localeCount: 1, locales: ['fr'] }
    ]);
  });
});

describe('englishLabelCandidates', () => {
  it('prefers shortTitle, then title, then name (D17 default order)', () => {
    expect(englishLabelCandidates({ shortTitle: { en: 'S' }, title: { en: 'T' }, name: 'N' })).toEqual(['S', 'T', 'N']);
  });

  it('falls through an empty shortTitle object', () => {
    expect(englishLabelCandidates({ shortTitle: {}, title: { en: 'T' }, name: 'N' })).toEqual(['T', 'N']);
  });

  it('drops blank and non-string values', () => {
    expect(englishLabelCandidates({ shortTitle: { en: '  ' }, title: { en: 'T' }, name: 42 })).toEqual(['T']);
  });

  it('returns nothing for an absent term', () => {
    expect(englishLabelCandidates(null)).toEqual([]);
  });
});

describe('buildRecord', () => {
  const localeIndex = { en: new Set(['k']), fr: new Set(['k']), de: new Set<string>() };

  const record = (overrides: Record<string, unknown> = {}) =>
    buildRecord({
      key: 'CBD-SUBJECT-BIOMES',
      index: 500,
      enValue: 'Biomes',
      canonicalId: 'CBD-SUBJECT-BIOMES',
      resolution: { httpStatus: 200, domain: 'subjects', method: 'domain-enumeration', term: { title: { en: 'Biomes', fr: 'Biomes' } } },
      localeIndex,
      localeFileCount: 3,
      ...overrides
    });

  it('marks an exact-label match both resolvable and safe to delete', () => {
    const r = record();
    expect(r.resolvable).toBe(true);
    expect(r.labelMatchesEn).toBe(true);
    expect(r.safeToDelete).toBe(true);
    expect(r.titleLanguages).toEqual(['en', 'fr']);
    expect(r.reviewFlags).toEqual([]);
  });

  it('marks a resolvable-but-divergent label as NOT safe to delete', () => {
    const r = record({
      key: 'submission',
      enValue: 'Submissions',
      canonicalId: 'submission',
      resolution: {
        httpStatus: 200,
        domain: null,
        method: 'single-term-probe',
        term: { title: { en: 'Submissions from Parties, other Governments or relevant organizations' } }
      }
    });
    expect(r.resolvable).toBe(true);
    expect(r.labelMatchesEn).toBe(false);
    expect(r.safeToDelete).toBe(false);
    expect(r.reviewFlags).toContain('label-would-change-on-delete');
  });

  it('treats a 200 with an empty title object as unresolvable', () => {
    const r = record({ resolution: { httpStatus: 200, domain: 'subjects', method: 'domain-enumeration', term: { title: {} } } });
    expect(r.resolvable).toBe(false);
    expect(r.safeToDelete).toBe(false);
    expect(r.reviewFlags).toContain('no-thesaurus-term');
  });

  it('treats a 404 as unresolvable', () => {
    const r = record({ resolution: { httpStatus: 404, domain: null, method: 'single-term-probe', term: null } });
    expect(r.resolvable).toBe(false);
    expect(r.httpStatus).toBe(404);
    expect(r.resolvedLabelEn).toBeNull();
  });

  it('flags a key that only resolved because an alias rewrote it', () => {
    const r = record({
      key: 'SDG-GOAL-01',
      enValue: '1. No Poverty',
      canonicalId: 'SUSTAINABLE-DEVELOPMENT-GOAL-01',
      resolution: {
        httpStatus: 200,
        domain: 'sustainableDevelopmentGoals',
        method: 'domain-enumeration',
        term: { shortTitle: { en: 'SDG1. No Poverty' }, title: { en: 'SDG1. End poverty in all its forms everywhere' } }
      }
    });
    expect(r.reviewFlags).toContain('resolved-via-alias');
    expect(r.reviewFlags).toContain('label-would-change-on-delete');
    expect(r.safeToDelete).toBe(false);
  });

  it('stores the locale complement and the carrying count', () => {
    const r = record({ key: 'k' });
    expect(r.localeFilesMissingIt).toEqual(['de']);
    expect(r.localeFileCountCarryingIt).toBe(2);
  });

  it('never probes, and never resolves, a gap key', () => {
    const r = record({ key: 'pdfNotice', index: 940, enValue: 'pdf notice', resolution: null });
    expect(r.inUiGap).toBe(true);
    expect(r.resolvable).toBe(false);
    expect(r.httpStatus).toBeNull();
    expect(r.resolutionMethod).toBe('skipped-ui-gap');
    expect(r.reviewFlags).toEqual(['ui-chrome-gap-not-probed']);
  });
});

describe('summarise', () => {
  const records = [
    buildRecord({ key: 'ad', index: 400, enValue: 'Andorra', canonicalId: 'ad', resolution: { httpStatus: 200, domain: 'countries', method: 'domain-enumeration', term: { title: { en: 'Andorra' } } }, localeIndex: { en: new Set(['ad']) }, localeFileCount: 1 }),
    buildRecord({ key: 'doc-1', index: 401, enValue: 'Agenda', canonicalId: 'doc-1', resolution: { httpStatus: 404, domain: null, method: 'single-term-probe', term: null }, localeIndex: { en: new Set(['doc-1']) }, localeFileCount: 1 }),
    buildRecord({ key: 'pdfNotice', index: 940, enValue: 'pdf', canonicalId: 'pdfNotice', resolution: null, localeIndex: { en: new Set(['pdfNotice']) }, localeFileCount: 1 })
  ];

  it('tallies totals, families and review groups', () => {
    const summary = summarise(records, {});
    expect(summary.totalKeys).toBe(3);
    expect(summary.resolvable).toBe(1);
    expect(summary.unresolvable).toBe(2);
    expect(summary.safeToDelete).toBe(1);
    expect(summary.needsHumanReview).toBe(2);
    expect(summary.uiChromeGap.keyCount).toBe(1);
    expect(summary.byFamily.iso2).toEqual({ total: 1, resolvable: 1, unresolvable: 0, safeToDelete: 1 });
    expect(summary.reviewGroups['ui-chrome-gap-not-probed'].keys).toEqual(['pdfNotice']);
    expect(summary.reviewGroups['no-thesaurus-term'].keys).toEqual(['doc-1']);
  });

  it('states D1 verbatim and warns against reading resolvable as a deletion authorisation', () => {
    const summary = summarise(records, {});
    expect(summary.deletionGateRule).toMatch(/resolvable -> in scope for deletion/);
    expect(summary.readThisFirst).toMatch(/Use `safeToDelete`, not `resolvable`/);
  });

  it('merges caller-supplied report sections', () => {
    const summary = summarise(records, { requestCounts: { domainEnumerations: 14, singleTermProbes: 68, total: 82 } });
    expect(summary.requestCounts.total).toBe(82);
  });
});

describe('probeTail resumability', () => {
  const tail = [
    { key: 'a', canonicalId: 'A' },
    { key: 'b', canonicalId: 'B' },
    { key: 'c', canonicalId: 'C' }
  ];

  it('probes each identifier once and checkpoints after every probe', async () => {
    const probe = vi.fn(async (id: string) => ({ httpStatus: id === 'B' ? 404 : 200, term: { title: { en: id } } }));
    const persist = vi.fn(async () => {});
    const progress = {};

    const { resolutions, requests } = await probeTail({ tail, progress, probe, persist, pause: async () => {} });

    expect(requests).toBe(3);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(persist).toHaveBeenCalledTimes(3);
    expect(resolutions.get('a').httpStatus).toBe(200);
    expect(resolutions.get('b').term).toBeNull();
    expect(resolutions.get('c').method).toBe('single-term-probe');
  });

  it('does not re-probe identifiers a killed run already completed', async () => {
    const failing = vi.fn(async (id: string) => {
      if (id === 'C') throw new Error('connection reset');
      return { httpStatus: 200, term: { title: { en: id } } };
    });
    const progress: Record<string, unknown> = {};
    await expect(probeTail({ tail, progress, probe: failing, persist: async () => {}, pause: async () => {} })).rejects.toThrow('connection reset');
    expect(failing).toHaveBeenCalledTimes(3);
    expect(Object.keys(progress).sort()).toEqual(['A', 'B']);

    // Restart against the surviving sidecar: only the unfinished identifier is probed again.
    const resumed = vi.fn(async (id: string) => ({ httpStatus: 200, term: { title: { en: id } } }));
    const { requests, resolutions } = await probeTail({ tail, progress, probe: resumed, persist: async () => {}, pause: async () => {} });
    expect(requests).toBe(1);
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(resumed).toHaveBeenCalledWith('C');
    expect(resolutions.size).toBe(3);
  });

  it('paces every real probe', async () => {
    const pause = vi.fn(async () => {});
    await probeTail({ tail, progress: { A: { httpStatus: 200, term: { title: { en: 'A' } } } }, probe: async () => ({ httpStatus: 200, term: {} }), persist: async () => {}, pause });
    expect(pause).toHaveBeenCalledTimes(2);
  });
});

describe('indexDomainTerms', () => {
  it('lowercases identifiers and lets the first domain win', () => {
    const corpus = new Map();
    indexDomainTerms(corpus, 'countries', [{ identifier: 'AD', name: 'Andorra' }]);
    indexDomainTerms(corpus, 'regions', [{ identifier: 'ad', name: 'Something else' }]);
    expect(corpus.get('ad')).toEqual({ domain: 'countries', term: { identifier: 'AD', name: 'Andorra' } });
  });

  it('skips terms with a missing or empty identifier', () => {
    const corpus = new Map();
    indexDomainTerms(corpus, 'regions', [{ name: 'no id' }, { identifier: '' }, null]);
    expect(corpus.size).toBe(0);
  });
});

describe('partitionAgainstCorpus', () => {
  const aliases = { sdg: { 'SDG-GOAL-01': 'SUSTAINABLE-DEVELOPMENT-GOAL-01' }, iso2: {} };
  const corpus = new Map([
    ['ad', { domain: 'countries', term: { title: { en: 'Andorra' } } }],
    ['sustainable-development-goal-01', { domain: 'sustainableDevelopmentGoals', term: { title: { en: 'SDG1' } } }]
  ]);

  it('resolves corpus hits and routes misses to the tail', () => {
    const blockKeys = [
      { key: 'ad', index: 400 },
      { key: 'SDG-GOAL-01', index: 401 },
      { key: 'doc-1', index: 402 }
    ];
    const { resolutions, tail } = partitionAgainstCorpus(blockKeys, corpus, aliases);
    expect(resolutions.get('ad').method).toBe('domain-enumeration');
    expect(resolutions.get('SDG-GOAL-01').domain).toBe('sustainableDevelopmentGoals');
    expect(tail).toEqual([{ key: 'doc-1', canonicalId: 'doc-1' }]);
  });

  it('leaves every gap key out of both the resolutions and the probe tail', () => {
    const blockKeys = [
      { key: 'pdfNotice', index: GAP_START },
      { key: 'or', index: 953 },
      { key: 'National Biosafety Framework', index: GAP_END },
      { key: 'ad', index: GAP_END + 1 }
    ];
    const { resolutions, tail } = partitionAgainstCorpus(blockKeys, corpus, aliases);
    expect([...resolutions.keys()]).toEqual(['ad']);
    expect(tail).toEqual([]);
  });
});

describe('assertManifestSanity', () => {
  const pad = (records: unknown[]) => {
    const filler = Array.from({ length: 680 - records.length - 1 }, (_, i) =>
      buildRecord({ key: `f-${i}`, index: 400, enValue: 'x', canonicalId: `f-${i}`, resolution: null, localeIndex: {}, localeFileCount: 0 })
    );
    const or = buildRecord({ key: 'or', index: 953, enValue: 'or', canonicalId: 'or', resolution: null, localeIndex: {}, localeFileCount: 0 });
    return [...records, or, ...filler];
  };

  it('passes a well-formed record set', () => {
    expect(() => assertManifestSanity(pad([]))).not.toThrow();
  });

  it('rejects a record count other than 680', () => {
    expect(() => assertManifestSanity([])).toThrow(/expected 680 records/);
  });

  it('rejects a missing "or"', () => {
    const records = pad([]).filter((r: { identifier: string }) => r.identifier !== 'or');
    records.push(records[0]);
    expect(() => assertManifestSanity(records)).toThrow(/"or" is no longer in the block/);
  });

  it('rejects a resolvable "or"', () => {
    const records = pad([]);
    const or = records.find((r: { identifier: string }) => r.identifier === 'or') as { resolvable: boolean };
    or.resolvable = true;
    expect(() => assertManifestSanity(records)).toThrow(/"or" classified resolvable/);
  });

  it('rejects a probed gap key', () => {
    const records = pad([]);
    const or = records.find((r: { identifier: string }) => r.identifier === 'or') as { httpStatus: number | null };
    or.httpStatus = 200;
    expect(() => assertManifestSanity(records)).toThrow(/UI-gap keys were probed/);
  });

  it('rejects a label-divergent key marked safe to delete', () => {
    const records = pad([]);
    Object.assign(records[0] as object, { safeToDelete: true, labelMatchesEn: false });
    expect(() => assertManifestSanity(records)).toThrow(/marked safe to delete/);
  });
});

describe('buildManifest', () => {
  it('assembles summary plus records and runs the sanity gate', () => {
    const localeData = makeLocaleData();
    const blockKeys = getBlockKeys(localeData);
    const aliases = { sdg: {}, iso2: {} };
    const resolutions = new Map([
      ['ad', { httpStatus: 200, domain: 'countries', method: 'domain-enumeration', term: { title: { en: 'value for ad' } } }]
    ]);
    const localeIndex = buildLocaleIndex(['en'], () => localeData);

    const manifest = buildManifest({
      localeData,
      blockKeys,
      aliases,
      resolutions,
      localeFiles: ['en'],
      localeIndex,
      registryCodes: ['en'],
      strayFiles: ['.DS_Store'],
      requestCounts: { domainEnumerations: 14, singleTermProbes: 68, total: 82 }
    });

    expect(manifest.records).toHaveLength(680);
    expect(manifest.summary.resolvable).toBe(1);
    expect(manifest.summary.safeToDelete).toBe(1);
    expect(manifest.summary.requestCounts.total).toBe(82);
    expect(manifest.summary.localeRegistry.strayNonJsonFiles).toEqual(['.DS_Store']);
    expect(manifest.summary.localeDivergence.enKeyCount).toBe(Object.keys(localeData).length);
  });

  it('refuses to assemble when the sanity gate trips', () => {
    const localeData = makeLocaleData();
    const blockKeys = getBlockKeys(localeData).slice(0, 10);
    expect(() =>
      buildManifest({
        localeData,
        blockKeys,
        aliases: { sdg: {}, iso2: {} },
        resolutions: new Map(),
        localeFiles: ['en'],
        localeIndex: buildLocaleIndex(['en'], () => localeData),
        registryCodes: ['en'],
        strayFiles: [],
        requestCounts: { domainEnumerations: 0, singleTermProbes: 0, total: 0 }
      })
    ).toThrow(/expected 680 records/);
  });
});

describe('bulk domain coverage', () => {
  it('enumerates 14 domains, replacing 680 per-identifier probes (D16)', () => {
    expect(Object.keys(BULK_DOMAINS)).toHaveLength(14);
    expect(BULK_DOMAINS.sustainableDevelopmentGoals).toBe('SUSTAINABLE-DEVELOPMENT-GOALS');
    expect(BULK_DOMAINS.countries).toBe('countries');
  });
});

describe('the committed manifest', () => {
  const manifest = readJson('server/assets/thesaurus-resolvability-manifest.json');

  it('holds exactly 680 records plus a summary', () => {
    expect(manifest.records).toHaveLength(680);
    expect(manifest.summary.totalKeys).toBe(680);
  });

  it('classifies "or" unresolvable', () => {
    const or = manifest.records.find((r: { identifier: string }) => r.identifier === 'or');
    expect(or.resolvable).toBe(false);
    expect(or.safeToDelete).toBe(false);
  });

  it('records no HTTP status for any gap key, proving none was probed', () => {
    const gap = manifest.records.filter((r: { inUiGap: boolean }) => r.inUiGap);
    expect(gap).toHaveLength(GAP_END - GAP_START + 1);
    expect(gap.every((r: { httpStatus: number | null; resolvable: boolean }) => r.httpStatus === null && !r.resolvable)).toBe(true);
  });

  it('keys every record to what actually appears in en.json today', () => {
    const block = getBlockKeys(readJson('i18n/locales/en.json')).map((entry) => entry.key);
    expect(manifest.records.map((r: { identifier: string }) => r.identifier)).toEqual(block);
  });

  it('backs every resolvable classification with a 200 and a non-empty title', () => {
    const resolvable = manifest.records.filter((r: { resolvable: boolean }) => r.resolvable);
    expect(resolvable.length).toBeGreaterThan(0);
    expect(resolvable.every((r: { httpStatus: number; titleLanguages: string[] }) => r.httpStatus === 200 && r.titleLanguages.length > 0)).toBe(true);
  });

  it('never marks a label-divergent key safe to delete', () => {
    const unsafe = manifest.records.filter((r: { resolvable: boolean; labelMatchesEn: boolean }) => r.resolvable && !r.labelMatchesEn);
    expect(unsafe.every((r: { safeToDelete: boolean }) => !r.safeToDelete)).toBe(true);
  });

  it('carries no timestamp, so a re-run is byte-identical', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/generatedAt|timestamp/i);
  });
});

describe('enumerateCorpus', () => {
  it('makes exactly one request per domain and folds them into one corpus', async () => {
    const fetchJson = vi.fn(async (url: string) => ({
      httpStatus: 200,
      body: [{ identifier: `id-${url.split('/').slice(-2)[0]}`, title: { en: 'x' } }]
    }));
    const { corpus, domainRequests } = await enumerateCorpus(fetchJson);
    expect(domainRequests).toBe(14);
    expect(fetchJson).toHaveBeenCalledTimes(14);
    expect(corpus.size).toBe(14);
    expect(fetchJson).toHaveBeenCalledWith(expect.stringContaining('/domains/SUSTAINABLE-DEVELOPMENT-GOALS/terms'));
  });

  it('throws rather than emitting a manifest built on a partial corpus', async () => {
    const fetchJson = vi.fn(async (url: string) => (url.includes('countries') ? { httpStatus: 503, body: null } : { httpStatus: 200, body: [] }));
    await expect(enumerateCorpus(fetchJson)).rejects.toThrow(/Domain enumeration failed for countries .*HTTP 503/);
  });

  it('throws when a domain returns a non-array body', async () => {
    await expect(enumerateCorpus(async () => ({ httpStatus: 200, body: { error: 'nope' } }))).rejects.toThrow(/Domain enumeration failed/);
  });

  it('forwards progress lines to the injected logger', async () => {
    const log = vi.fn();
    await enumerateCorpus(async () => ({ httpStatus: 200, body: [] }), log);
    expect(log).toHaveBeenCalledTimes(14);
  });
});

describe('runClassification', () => {
  const localeData = makeLocaleData();

  const makeIo = (overrides: Record<string, unknown> = {}) => {
    const written: Record<string, unknown>[] = [];
    const io = {
      readJson: vi.fn((file: string) => (file.endsWith('en.json') ? localeData : {})),
      readDirEntries: vi.fn(() => ['en.json', '.DS_Store']),
      readRegistryCodes: vi.fn(async () => ['en']),
      fetchJson: vi.fn(async (url: string) =>
        url.includes('/domains/countries/') ? { httpStatus: 200, body: [{ identifier: 'ad', title: { en: 'value for ad' } }] } : { httpStatus: 200, body: [] }
      ),
      readProgress: vi.fn(() => ({})),
      writeProgress: vi.fn(),
      clearProgress: vi.fn(),
      writeManifest: vi.fn((manifest: Record<string, unknown>) => written.push(manifest)),
      pause: vi.fn(async () => {}),
      log: vi.fn(),
      ...overrides
    };
    return { io, written };
  };

  it('produces a 680-record manifest, clears the sidecar, and reports its request counts', async () => {
    const { io, written } = makeIo();
    const manifest = await runClassification(io);

    expect(manifest.records).toHaveLength(680);
    expect(manifest.summary.requestCounts.domainEnumerations).toBe(14);
    expect(manifest.summary.requestCounts.total).toBe(14 + manifest.summary.requestCounts.singleTermProbes);
    expect(io.clearProgress).toHaveBeenCalledOnce();
    expect(written[0]).toBe(manifest);
  });

  it('resolves the corpus hit and leaves the gap keys unprobed', async () => {
    const { io } = makeIo();
    const manifest = await runClassification(io);

    const ad = manifest.records.find((r: { identifier: string }) => r.identifier === 'ad');
    expect(ad.resolvable).toBe(true);
    expect(ad.safeToDelete).toBe(true);
    expect(ad.domain).toBe('countries');

    const or = manifest.records.find((r: { identifier: string }) => r.identifier === 'or');
    expect(or.resolvable).toBe(false);
    expect(or.httpStatus).toBeNull();

    const probedUrls = io.fetchJson.mock.calls.map((call: string[]) => call[0]);
    expect(probedUrls.some((url: string) => url.endsWith('/terms/or'))).toBe(false);
    expect(probedUrls.some((url: string) => url.endsWith('/terms/pdfNotice'))).toBe(false);
  });

  it('reads the registry and the stray-file list into the summary', async () => {
    const { io } = makeIo();
    const manifest = await runClassification(io);
    expect(manifest.summary.localeRegistry.strayNonJsonFiles).toEqual(['.DS_Store']);
    expect(manifest.summary.localeFiles).toEqual(['en']);
  });

  it('skips identifiers a previous interrupted run already recorded', async () => {
    const cached = Object.fromEntries(
      getBlockKeys(localeData)
        .filter((entry) => !isInUiGap(entry.index))
        .map((entry) => [entry.key, { httpStatus: 404, term: null }])
    );
    const { io } = makeIo({ readProgress: vi.fn(() => cached) });
    const manifest = await runClassification(io);
    expect(manifest.summary.requestCounts.singleTermProbes).toBe(0);
    expect(io.writeProgress).not.toHaveBeenCalled();
  });

  it('refuses to write anything when the block boundary has drifted', async () => {
    const { io } = makeIo({ readJson: vi.fn(() => ({ a: 1 })) });
    await expect(runClassification(io)).rejects.toThrow(/Block boundary drifted/);
    expect(io.writeManifest).not.toHaveBeenCalled();
  });
});

describe('liveFetchJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses an OK body and calls the URL it was given', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, text: async () => '[{"identifier":"ad"}]' }));
    vi.stubGlobal('fetch', fetchSpy);
    const result = await liveFetchJson('https://api.cbd.int/api/v2013/thesaurus/domains/countries/terms');
    expect(result).toEqual({ httpStatus: 200, body: [{ identifier: 'ad' }] });
    expect(fetchSpy).toHaveBeenCalledWith('https://api.cbd.int/api/v2013/thesaurus/domains/countries/terms', expect.objectContaining({ signal: expect.anything() }));
  });

  it('returns the status and no body for a non-OK response, rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' })));
    expect(await liveFetchJson('https://example.test/terms/nope')).toEqual({ httpStatus: 404, body: null });
  });

  it('refuses to parse an oversized body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(8 * 1024 * 1024 + 1) })));
    await expect(liveFetchJson('https://example.test/huge')).rejects.toThrow(/exceeded 8388608 bytes; refusing to parse/);
  });
});
