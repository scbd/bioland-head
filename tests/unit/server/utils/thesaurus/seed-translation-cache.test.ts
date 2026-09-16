import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Plain Vitest (`environment: 'node'`) with `vi.stubGlobal` for the Nitro auto-imports, matching
 * `tests/unit/server/utils/thesaurus/resolve-terms.test.ts`. There is no `@nuxt/test-utils` runtime
 * harness in this repo.
 *
 * `server/utils/translate/index.js` reaches for `useRuntimeConfig()` at pool-creation time, so it is
 * stubbed before the module under test is imported. Every DB and storage call in these specs is injected
 * through `runSeed`'s `deps` seam — **no spec here touches a real database.**
 */
vi.stubGlobal('useRuntimeConfig', () => ({}))
vi.stubGlobal('useStorage', () => ({ setItem: vi.fn(), getMount: () => ({ driver: { name: 'memory' } }) }))

const {
  BLOCK_FIRST_KEY,
  BLOCK_LAST_KEY,
  SIX_MONTHS_MS,
  buildIdentifierLabelMap,
  buildSeedPairs,
  detectLabelCollisions,
  buildDbRows,
  buildStorageEntries,
  hasDurableThesaurusMount,
  runSeed
} = await import('~/server/utils/thesaurus/seed-translation-cache.js')

const repoRoot = resolve(__dirname, '../../../../..')
const enJson = JSON.parse(readFileSync(resolve(repoRoot, 'i18n/locales/en.json'), 'utf8'))
const committedMap = JSON.parse(
  readFileSync(resolve(repoRoot, 'server/utils/thesaurus/identifier-labels.json'), 'utf8')
)

/** A durable mount, as the `fs` driver would report itself. */
const durableStorage = () => ({ setItem: vi.fn().mockResolvedValue(undefined), getMount: () => ({ driver: { name: 'fs' } }) })

/** Minimal injected dependency set: two locale files, a durable mount, no real DB. */
function makeDeps(overrides: Record<string, unknown> = {}) {
  const files: Record<string, Record<string, string>> = {
    'fr.json': { 'ID-A': 'Alpha (fr)', 'ID-B': 'Beta (fr)' },
    'es.json': { 'ID-A': 'Alpha (es)' }
  }
  return {
    identifierLabels: { 'ID-A': 'Alpha', 'ID-B': 'Beta' },
    localesDir: '/locales',
    readDir: vi.fn().mockResolvedValue([...Object.keys(files), '.DS_Store', 'en.json']),
    readJson: vi.fn(async (p: string) => {
      const name = p.split('/').pop() as string
      if (!files[name]) throw new Error(`no such fixture ${name}`)
      return files[name]
    }),
    storage: durableStorage(),
    getCachedFn: vi.fn().mockResolvedValue(new Map()),
    saveFn: vi.fn().mockResolvedValue(undefined),
    cacheKeyFn: (t: string) => t,
    now: 1_700_000_000_000,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides
  }
}

describe('buildIdentifierLabelMap', () => {
  it('extracts the sentinel-bounded window from the real en.json', () => {
    const map = buildIdentifierLabelMap(enJson)
    expect(Object.keys(map).length).toBeGreaterThan(600)
    expect(map[BLOCK_FIRST_KEY]).toBe(enJson[BLOCK_FIRST_KEY])
  })

  it('drops identity-mapped UI strings, including the last sentinel itself', () => {
    const map = buildIdentifierLabelMap(enJson)
    expect(map[BLOCK_LAST_KEY]).toBeUndefined()
    for (const [id, label] of Object.entries(map)) expect(id).not.toBe(label)
  })

  it('throws rather than guessing when the first sentinel is missing', () => {
    expect(() => buildIdentifierLabelMap({ a: '1', [BLOCK_LAST_KEY]: 'x' })).toThrow(/sentinel drift/)
  })

  it('throws rather than guessing when the last sentinel is missing', () => {
    expect(() => buildIdentifierLabelMap({ [BLOCK_FIRST_KEY]: 'x', a: '1' })).toThrow(/sentinel drift/)
  })

  it('throws when the sentinels are out of order', () => {
    expect(() => buildIdentifierLabelMap({ [BLOCK_LAST_KEY]: 'x', [BLOCK_FIRST_KEY]: 'y' }))
      .toThrow(/precedes/)
  })

  it('tolerates a nullish input without throwing a TypeError', () => {
    expect(() => buildIdentifierLabelMap(undefined)).toThrow(/sentinel drift/)
  })
})

describe('the committed identifier-labels.json artifact', () => {
  it('round-trips: every entry equals en.json at that key', () => {
    for (const [identifier, label] of Object.entries(committedMap)) {
      expect(enJson[identifier]).toBe(label)
    }
  })

  it('is exactly what buildIdentifierLabelMap produces from the current en.json', () => {
    expect({ ...buildIdentifierLabelMap(enJson) }).toEqual(committedMap)
  })

  it('carries no identity-mapped key', () => {
    for (const [identifier, label] of Object.entries(committedMap)) expect(identifier).not.toBe(label)
  })
})

describe('buildSeedPairs', () => {
  it('skips identifiers absent from the locale file', () => {
    const { pairs, skippedMissing } = buildSeedPairs({ a: 'A', b: 'B', c: 'C' }, { a: 'A-fr' })
    expect(pairs).toEqual([{ identifier: 'a', englishLabel: 'A', localeLabel: 'A-fr' }])
    expect(skippedMissing).toBe(2)
  })

  it('handles the near-total divergence case (no.json / ps.json shape)', () => {
    const labels = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, `L${i}`]))
    const { pairs, skippedMissing } = buildSeedPairs(labels, { k7: 'seven' })
    expect(pairs).toHaveLength(1)
    expect(skippedMissing).toBe(299)
  })

  it('handles the 243-key cluster shape', () => {
    const labels = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, `L${i}`]))
    const locale = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`k${i}`, `v${i}`]))
    const { pairs, skippedMissing } = buildSeedPairs(labels, locale)
    expect(pairs).toHaveLength(257)
    expect(skippedMissing).toBe(243)
  })

  it('keeps pairs whose locale label equals the English label', () => {
    const { pairs } = buildSeedPairs({ a: 'Same' }, { a: 'Same' })
    expect(pairs).toHaveLength(1)
  })

  it('skips empty-string and non-string locale values', () => {
    const { pairs, skippedMissing } = buildSeedPairs({ a: 'A', b: 'B' }, { a: '', b: 42 as unknown as string })
    expect(pairs).toHaveLength(0)
    expect(skippedMissing).toBe(2)
  })
})

describe('detectLabelCollisions', () => {
  it('treats a shared English label with agreeing values as one safe row', () => {
    const { safe, collisions, deduped, withheld } = detectLabelCollisions([
      { identifier: 'x', englishLabel: 'Communication', localeLabel: 'Comm-fr' },
      { identifier: 'y', englishLabel: 'Communication', localeLabel: 'Comm-fr' }
    ])
    expect(safe).toHaveLength(1)
    expect(collisions).toHaveLength(0)
    expect(deduped).toBe(1)
    expect(withheld).toBe(0)
  })

  it('withholds BOTH identifiers when a shared English label has diverging values', () => {
    const { safe, collisions, withheld } = detectLabelCollisions([
      { identifier: 'CBD-SUBJECT-NBSAP', englishLabel: 'NBSAPs', localeLabel: 'Estrategiak' },
      { identifier: 'doc-14', englishLabel: 'NBSAPs', localeLabel: 'Estrategia' }
    ])
    expect(safe).toHaveLength(0)
    expect(collisions).toEqual([
      { englishLabel: 'NBSAPs', identifiers: ['CBD-SUBJECT-NBSAP', 'doc-14'], values: ['Estrategiak', 'Estrategia'] }
    ])
    expect(withheld).toBe(2)
  })

  it('leaves non-colliding pairs untouched alongside a collision', () => {
    const { safe, collisions } = detectLabelCollisions([
      { identifier: 'a', englishLabel: 'A', localeLabel: 'a-fr' },
      { identifier: 'b', englishLabel: 'Dup', localeLabel: 'one' },
      { identifier: 'c', englishLabel: 'Dup', localeLabel: 'two' }
    ])
    expect(safe.map(p => p.identifier)).toEqual(['a'])
    expect(collisions).toHaveLength(1)
  })

  it('finds the real collisions present in the committed map', () => {
    const byLabel = new Map<string, string[]>()
    for (const [id, label] of Object.entries(committedMap) as [string, string][]) {
      byLabel.set(label, [...(byLabel.get(label) ?? []), id])
    }
    const shared = [...byLabel.values()].filter(ids => ids.length > 1)
    expect(shared.length).toBeGreaterThan(0)
  })
})

describe('buildDbRows', () => {
  it('emits the saveCachedTranslations record shape and never a hash column', () => {
    const rows = buildDbRows([{ englishLabel: 'Alpha', localeLabel: 'Alpha-fr' }], (t: string) => t)
    expect(rows).toEqual([{ cacheKey: 'Alpha', sourceText: 'Alpha', translation: 'Alpha-fr' }])
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['cacheKey', 'sourceText', 'translation'])
      expect(row).not.toHaveProperty('cache_key_hash')
      expect(row).not.toHaveProperty('cacheKeyHash')
    }
  })

  it('defaults to the real getCacheKey, which passes short text through verbatim', () => {
    expect(buildDbRows([{ englishLabel: 'Short', localeLabel: 'Court' }])[0].cacheKey).toBe('Short')
  })
})

describe('buildStorageEntries', () => {
  it('builds versioned label:tr keys with an explicit six-month expiresAt', () => {
    const now = 1_700_000_000_000
    const entries = buildStorageEntries([{ identifier: 'GBF-GOAL-A', localeLabel: 'But A' }], 'fr', now)
    expect(entries[0].key).toBe('label:tr:1:GBF-GOAL-A:fr')
    expect(entries[0].entry).toEqual({ value: 'But A', source: 'translation', expiresAt: now + SIX_MONTHS_MS })
  })

  it('percent-encodes identifiers and locales so separators cannot collide', () => {
    expect(buildStorageEntries([{ identifier: 'a:b', localeLabel: 'v' }], 'fr', 0)[0].key)
      .toBe('label:tr:1:a%3Ab:fr')
  })
})

describe('hasDurableThesaurusMount', () => {
  it('rejects the in-memory fallback driver', () => {
    expect(hasDurableThesaurusMount({ getMount: () => ({ driver: { name: 'memory' } }) })).toBe(false)
  })
  it('accepts an fs-backed mount', () => {
    expect(hasDurableThesaurusMount({ getMount: () => ({ driver: { name: 'fs' } }) })).toBe(true)
  })
  it('rejects a storage object with no getMount, and a throwing one', () => {
    expect(hasDurableThesaurusMount({})).toBe(false)
    expect(hasDurableThesaurusMount(null)).toBe(false)
    expect(hasDurableThesaurusMount({ getMount: () => { throw new Error('boom') } })).toBe(false)
  })
})

describe('runSeed — dry run', () => {
  it('is the default mode and writes to neither store', async () => {
    const deps = makeDeps()
    const summary = await runSeed({}, deps)
    expect(summary.mode).toBe('dry-run')
    expect(deps.saveFn).not.toHaveBeenCalled()
    expect(deps.storage.setItem).not.toHaveBeenCalled()
    expect(deps.getCachedFn).not.toHaveBeenCalled()
  })

  it('stays a dry run when called with no arguments at all', async () => {
    const summary = await runSeed(undefined, makeDeps())
    expect(summary.mode).toBe('dry-run')
  })

  it('reports per-locale counts and totals', async () => {
    const summary = await runSeed({ dryRun: true }, makeDeps())
    expect(summary.locales).toEqual([
      expect.objectContaining({ locale: 'es', candidates: 1, wouldWrite: 1, skippedMissing: 1 }),
      expect.objectContaining({ locale: 'fr', candidates: 2, wouldWrite: 2, skippedMissing: 0 })
    ])
    expect(summary.totals.wouldWrite).toBe(3)
    expect(summary.totals.dbRowsWritten).toBe(0)
    expect(summary.identifierCount).toBe(2)
  })

  it('excludes en.json and non-json files from the locale set', async () => {
    const summary = await runSeed({}, makeDeps())
    expect(summary.locales.map(l => l.locale)).toEqual(['es', 'fr'])
  })

  it('runs even when the thesaurus mount is not durable, and says so', async () => {
    const summary = await runSeed({}, makeDeps({ storage: { getMount: () => ({ driver: { name: 'memory' } }) } }))
    expect(summary.durableStorageMount).toBe(false)
    expect(summary.aborted).toBeNull()
    expect(summary.totals.wouldWrite).toBe(3)
  })

  it('reports a collision instead of silently picking a winner', async () => {
    const deps = makeDeps({
      identifierLabels: { 'ID-A': 'Shared', 'ID-B': 'Shared' },
      readDir: vi.fn().mockResolvedValue(['fr.json']),
      readJson: vi.fn().mockResolvedValue({ 'ID-A': 'un', 'ID-B': 'deux' })
    })
    const summary = await runSeed({}, deps)
    expect(summary.collisions).toEqual([
      { locale: 'fr', kind: 'shared-english-label', englishLabel: 'Shared', identifiers: ['ID-A', 'ID-B'], values: ['un', 'deux'] }
    ])
    expect(summary.totals.wouldWrite).toBe(0)
    expect(summary.totals.withheldCollision).toBe(2)
    expect(summary.totals.dedupedSharedLabel).toBe(0)
  })

  it('skips an unparseable locale file and keeps going', async () => {
    const deps = makeDeps({
      readDir: vi.fn().mockResolvedValue(['bad.json', 'fr.json']),
      readJson: vi.fn(async (p: string) =>
        p.endsWith('bad.json') ? Promise.reject(new Error('Unexpected token')) : { 'ID-A': 'Alpha (fr)' })
    })
    const summary = await runSeed({}, deps)
    expect(summary.unparseableFiles).toEqual([{ file: 'bad.json', reason: 'Unexpected token' }])
    expect(summary.locales.map(l => l.locale)).toEqual(['fr'])
  })
})

describe('runSeed — live path gates', () => {
  it('aborts before any write when the thesaurus mount is not durable', async () => {
    const deps = makeDeps({ storage: { setItem: vi.fn(), getMount: () => ({ driver: { name: 'memory' } }) } })
    const summary = await runSeed({ dryRun: false }, deps)
    expect(summary.aborted).toMatch(/durable-storage-gate/)
    expect(deps.saveFn).not.toHaveBeenCalled()
    expect(deps.getCachedFn).not.toHaveBeenCalled()
    expect(deps.storage.setItem).not.toHaveBeenCalled()
  })

  it('aborts before any write when the DB reachability probe rejects', async () => {
    const deps = makeDeps({ getCachedFn: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) })
    const summary = await runSeed({ dryRun: false }, deps)
    expect(summary.aborted).toMatch(/db-reachability-probe failed.*ECONNREFUSED/)
    expect(deps.saveFn).not.toHaveBeenCalled()
    expect(deps.storage.setItem).not.toHaveBeenCalled()
  })

  it('probes with a sentinel text that can never match a real label', async () => {
    const deps = makeDeps()
    await runSeed({ dryRun: false }, deps)
    expect(deps.getCachedFn.mock.calls[0]).toEqual([['__i18n_seed_connectivity_probe__'], 'en', 'en'])
  })
})

describe('runSeed — live path writes', () => {
  it('writes one batched DB call per locale, never one per row', async () => {
    const deps = makeDeps()
    const summary = await runSeed({ dryRun: false }, deps)
    expect(deps.saveFn).toHaveBeenCalledTimes(2)
    expect(deps.saveFn.mock.calls[0][1]).toBe('es')
    expect(deps.saveFn.mock.calls[1][0]).toHaveLength(2)
    expect(deps.saveFn.mock.calls[1][1]).toBe('fr')
    expect(deps.saveFn.mock.calls[1][2]).toBe('en')
    expect(summary.totals.dbRowsWritten).toBe(3)
    expect(summary.totals.storageEntriesWritten).toBe(3)
  })

  it('never holds more than one saveCachedTranslations call in flight', async () => {
    let inFlight = 0
    let peak = 0
    const saveFn = vi.fn(async () => {
      peak = Math.max(peak, ++inFlight)
      await new Promise(r => setTimeout(r, 1))
      inFlight--
    })
    await runSeed({ dryRun: false }, makeDeps({ saveFn }))
    expect(peak).toBe(1)
  })

  it('writes the MariaDB row before its nitro entry', async () => {
    const order: string[] = []
    const storage = { setItem: vi.fn(async () => { order.push('storage') }), getMount: () => ({ driver: { name: 'fs' } }) }
    await runSeed({ dryRun: false }, makeDeps({ storage, saveFn: vi.fn(async () => { order.push('db') }) }))
    expect(order[0]).toBe('db')
    expect(new Set(order.slice(0, 2))).toEqual(new Set(['db', 'storage']))
  })

  it('never includes a hash column in anything handed to saveCachedTranslations', async () => {
    const deps = makeDeps()
    await runSeed({ dryRun: false }, deps)
    for (const [rows] of deps.saveFn.mock.calls) {
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(['cacheKey', 'sourceText', 'translation'])
    }
  })

  it('skips a row whose existing cached value differs, and reports it', async () => {
    const deps = makeDeps({
      getCachedFn: vi.fn(async (texts: string[]) =>
        texts.includes('Alpha') ? new Map([['Alpha', 'a-value-from-production']]) : new Map())
    })
    const summary = await runSeed({ dryRun: false }, deps)
    const conflicts = summary.collisions.filter(c => c.kind === 'existing-row-conflict')
    expect(conflicts).toHaveLength(2)
    expect(conflicts[0]).toMatchObject({ englishLabel: 'Alpha', values: ['a-value-from-production', 'Alpha (es)'] })
    expect(summary.totals.skippedExistingConflict).toBe(2)
    expect(summary.totals.dbRowsWritten).toBe(1)
  })

  it('does not treat an identical existing value as a conflict', async () => {
    const deps = makeDeps({
      getCachedFn: vi.fn(async (texts: string[]) =>
        texts.includes('Alpha') ? new Map([['Alpha', 'Alpha (fr)']]) : new Map())
    })
    const summary = await runSeed({ dryRun: false }, deps)
    expect(summary.collisions.filter(c => c.kind === 'existing-row-conflict')).toHaveLength(1)
  })

  it('chunks nitro writes rather than firing a whole locale at once', async () => {
    const labels = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`k${i}`, `L${i}`]))
    const locale = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`k${i}`, `v${i}`]))
    let inFlight = 0
    let peak = 0
    const storage = {
      setItem: vi.fn(async () => { peak = Math.max(peak, ++inFlight); await Promise.resolve(); inFlight-- }),
      getMount: () => ({ driver: { name: 'fs' } })
    }
    await runSeed({ dryRun: false }, makeDeps({
      identifierLabels: labels,
      readDir: vi.fn().mockResolvedValue(['fr.json']),
      readJson: vi.fn().mockResolvedValue(locale),
      storage
    }))
    expect(storage.setItem).toHaveBeenCalledTimes(120)
    expect(peak).toBeLessThanOrEqual(50)
  })

  it('is idempotent: a second run writes the same count and the same values', async () => {
    const written = new Map<string, string>()
    const saveFn = vi.fn(async (rows: Array<{ cacheKey: string, translation: string }>, locale: string) => {
      for (const r of rows) written.set(`${locale}:${r.cacheKey}`, r.translation)
    })
    const getCachedFn = vi.fn(async (texts: string[], locale: string) =>
      new Map(texts.filter(t => written.has(`${locale}:${t}`)).map(t => [t, written.get(`${locale}:${t}`) as string])))

    const first = await runSeed({ dryRun: false }, makeDeps({ saveFn, getCachedFn }))
    const snapshot = new Map(written)
    const second = await runSeed({ dryRun: false }, makeDeps({ saveFn, getCachedFn }))

    expect(second.totals.dbRowsWritten).toBe(first.totals.dbRowsWritten)
    expect(second.totals.skippedExistingConflict).toBe(0)
    expect(second.collisions).toHaveLength(0)
    expect(written).toEqual(snapshot)
  })
})

describe('runSeed — dry run against the real repo data', () => {
  it('reports every locale on disk with a bounded, non-zero row total and zero writes', async () => {
    const storage = { setItem: vi.fn(), getMount: () => ({ driver: { name: 'fs' } }) }
    const saveFn = vi.fn()
    const summary = await runSeed({ dryRun: true }, {
      identifierLabels: committedMap,
      localesDir: resolve(repoRoot, 'i18n/locales'),
      storage,
      saveFn,
      getCachedFn: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    })

    expect(summary.locales.length).toBe(81)
    expect(summary.totals.wouldWrite).toBeGreaterThan(0)
    // The war-game's ceiling: 680 candidate keys x 81 locales.
    expect(summary.totals.wouldWrite).toBeLessThanOrEqual(680 * 81)
    expect(saveFn).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(summary.unparseableFiles).toEqual([])
  })
})
