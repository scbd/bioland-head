import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Plain Vitest (`environment: 'node'`) with `vi.stubGlobal` for the Nitro auto-imports, matching
 * `tests/unit/server/utils/context.test.js`. There is no `@nuxt/test-utils` runtime harness in this repo.
 */

// --- fixtures: the four live response shapes (see phase-02/context.md § Live API facts) -----------------
/** 6-language coverage. */
const SIX_LANG = {
  identifier: 'CCA4B662-0000-0000-0000-000000000001',
  name: 'Access and benefit-sharing',
  title: { en: 'Access and benefit-sharing', fr: 'Accès et partage des avantages', es: 'Acceso y participación', ar: 'ar-title', ru: 'ru-title', zh: 'zh-title' },
  shortTitle: { en: 'ABS', fr: 'APA', es: 'APB', ar: 'ar-short', ru: 'ru-short', zh: 'zh-short' }
}
/** en/es/fr only. */
const GBF_TARGET_01 = {
  identifier: 'GBF-TARGET-01',
  name: 'GBF-T01. All areas are planned or managed',
  title: { en: 'GBF-T01. All areas are planned or managed', es: 'GBF-T01. Todas las areas', fr: 'GBF-T01. Toutes les zones' },
  shortTitle: { en: 'GBF-T01. Plan and Manage all Areas', es: 'GBF-T01. Planificar', fr: 'GBF-T01. Planifier' }
}
/** en only. */
const GBF_GOAL_A = {
  identifier: 'GBF-GOAL-A',
  name: 'Goal A',
  title: { en: 'Goal A' },
  shortTitle: { en: 'Goal A' }
}
/** Empty `shortTitle` — the D17 fallthrough case. */
const BIOMES = {
  identifier: 'CBD-SUBJECT-BIOMES',
  name: 'Biomes',
  title: { en: 'Biomes', fr: 'Biomes (fr)' },
  shortTitle: {}
}
/** A `regions` term: `shortTitle` is an internal abbreviation, not a label. */
const REGION = {
  identifier: 'REGION-AFR-MIDDLE',
  name: 'Africa - Middle Africa',
  title: { en: 'Africa - Middle Africa' },
  shortTitle: { en: 'AFR – Middle' }
}

const TERMS: Record<string, Record<string, unknown>> = {
  [SIX_LANG.identifier]: SIX_LANG,
  [GBF_TARGET_01.identifier]: GBF_TARGET_01,
  [GBF_GOAL_A.identifier]: GBF_GOAL_A,
  [BIOMES.identifier]: BIOMES,
  [REGION.identifier]: REGION
}

let store: Map<string, unknown>
let assets: Map<string, unknown>
let warn: ReturnType<typeof vi.fn>
let fetcher: ReturnType<typeof vi.fn>
let mod: typeof import('../../../../../server/utils/thesaurus/resolve-terms')

/** `getThesaurusByKey`'s real contract: failures are filtered out, `[false]` when nothing resolved. */
const realisticFetcher = (known: Record<string, Record<string, unknown>> = TERMS) =>
  vi.fn(async (_event: unknown, keys: string[]) => {
    const hits = keys.map((k) => known[k]).filter(Boolean)
    return hits.length > 0 ? hits : [false]
  })

beforeEach(async () => {
  vi.resetModules()
  store = new Map()
  assets = new Map()
  warn = vi.fn()
  fetcher = realisticFetcher()
  vi.stubGlobal('useStorage', (group: string) => {
    const backing = group === 'assets:server' ? assets : store
    return {
      getItem: async (key: string) => (backing.has(key) ? backing.get(key) : null),
      setItem: async (key: string, value: unknown) => { backing.set(key, value) },
      removeItem: async (key: string) => { backing.delete(key) },
      getKeys: async (prefix = '') => [...backing.keys()].filter((k) => k.startsWith(prefix))
    }
  })
  vi.stubGlobal('consola', { warn, error: vi.fn(), debug: vi.fn(), info: vi.fn() })
  vi.stubGlobal('getThesaurusByKey', fetcher)
  mod = await import('../../../../../server/utils/thesaurus/resolve-terms')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const seed = (tier: 'api' | 'tr' | 'fb', id: string, locale: string, value: string, source: string, expiresAt: number) =>
  store.set(mod.buildLabelKey(tier as never, id, locale), { value, source, expiresAt })

describe('resolveTerms — label field preference (D17)', () => {
  it('defaults to shortTitle -> title -> name', () => {
    expect(mod.DEFAULT_LABEL_FIELDS).toEqual(['shortTitle', 'title', 'name'])
    expect(mod.labelFieldOrder()).toEqual(['shortTitle', 'title', 'name'])
    expect(mod.pickLabel(REGION, 'en')).toBe('AFR – Middle')
  })

  it('declares the regions title-first override in the real config, not in a test patch', async () => {
    const { dataSourceConfigs } = await import('../../../../../server/utils/thesaurus/config')
    expect(dataSourceConfigs.regions.labelFields).toEqual(['title', 'shortTitle', 'name'])
    expect(mod.labelFieldOrder('regions')).toEqual(['title', 'shortTitle', 'name'])
    // Unconfigured domains keep the default, so the override is opt-in per domain.
    expect(mod.labelFieldOrder('gbfTargets')).toEqual(['shortTitle', 'title', 'name'])
    expect(mod.labelFieldOrder('no-such-domain')).toEqual(['shortTitle', 'title', 'name'])
  })

  it('threads the domain through resolveTerms so a regions term renders its long title', async () => {
    // Without the domain wired into resolveTerms this returns the internal abbreviation.
    const withDomain = await mod.resolveTerms(['REGION-AFR-MIDDLE'], 'en', undefined, 'regions')
    expect(withDomain['REGION-AFR-MIDDLE']).toEqual({ value: 'Africa - Middle Africa', source: 'api' })

    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    store.clear()
    const noDomain = await fresh.resolveTerms(['REGION-AFR-MIDDLE'], 'en')
    expect(noDomain['REGION-AFR-MIDDLE']).toEqual({ value: 'AFR – Middle', source: 'api' })
  })

  it('applies the domain order to the English fallback too', async () => {
    const out = await mod.resolveTerms(['REGION-AFR-MIDDLE'], 'fr', undefined, 'regions')
    expect(out['REGION-AFR-MIDDLE']).toEqual({ value: 'Africa - Middle Africa', source: 'fallback' })
  })

  it('falls through an empty shortTitle to title', async () => {
    expect(mod.pickLabel(BIOMES, 'en')).toBe('Biomes')
    const out = await mod.resolveTerms(['CBD-SUBJECT-BIOMES'], 'en')
    expect(out['CBD-SUBJECT-BIOMES']).toEqual({ value: 'Biomes', source: 'api' })
  })

  it('does not treat the plain-English name as a localized value', () => {
    expect(mod.pickLabel({ name: 'Biomes' }, 'fr')).toBeUndefined()
    expect(mod.pickLabel({ name: 'Biomes' }, 'en')).toBe('Biomes')
  })

  it('returns undefined for a missing item or a non-string field value', () => {
    expect(mod.pickLabel(null, 'en')).toBeUndefined()
    expect(mod.pickLabel(undefined, 'en')).toBeUndefined()
    expect(mod.pickLabel({ title: 42, name: 7 }, 'en')).toBeUndefined()
    expect(mod.pickLabel({ name: '   ' }, 'en')).toBeUndefined()
    expect(mod.pickLabel({ title: { en: '  ' }, name: 'Fallthrough' }, 'en')).toBe('Fallthrough')
  })
})

describe('resolveTerms — resolution outcomes', () => {
  it('returns source api when the locale is covered', async () => {
    const out = await mod.resolveTerms([SIX_LANG.identifier], 'fr')
    expect(out[SIX_LANG.identifier]).toEqual({ value: 'APA', source: 'api' })
    expect(store.has(mod.buildLabelKey('api', SIX_LANG.identifier, 'fr'))).toBe(true)
  })

  it('falls back to English with source fallback when the locale is not covered', async () => {
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'fr')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'fallback' })
    const stored = store.get(mod.buildLabelKey('fb', 'GBF-GOAL-A', 'fr')) as { expiresAt: number }
    // 1-minute lifetime, not a year: a degraded value must not poison the cache.
    expect(stored.expiresAt - Date.now()).toBeLessThanOrEqual(60_000)
  })

  it('serves the raw identifier and warns once on a 404 (D5)', async () => {
    const out = await mod.resolveTerms(['SDG-GOAL-01'], 'es')
    expect(out['SDG-GOAL-01']).toEqual({ value: 'SDG-GOAL-01', source: 'identifier' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('resolveTerms: unresolved identifier', { identifier: 'SDG-GOAL-01', locale: 'es' })
    // Only the identifier and the locale — no response body, no headers.
    expect(Object.keys(warn.mock.calls[0][1])).toEqual(['identifier', 'locale'])
  })

  it('degrades when the fetcher itself throws', async () => {
    vi.stubGlobal('getThesaurusByKey', vi.fn(async () => { throw new Error('boom') }))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    const out = await fresh.resolveTerms(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'GBF-GOAL-A', source: 'identifier' })
  })
})

describe('resolveTerms — cache namespaces and TTL', () => {
  it('prefers api over tr for the same id and locale', async () => {
    const future = Date.now() + 60_000
    seed('tr', 'GBF-GOAL-A', 'fr', 'traduit', 'translation', future)
    seed('api', 'GBF-GOAL-A', 'fr', 'depuis-api', 'api', future)
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'fr')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'depuis-api', source: 'api' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('serves a tr hit rather than resolving a fresh fallback', async () => {
    seed('tr', 'GBF-GOAL-A', 'fr', 'traduit', 'translation', Date.now() + 60_000)
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'fr')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'traduit', source: 'translation' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('re-resolves when only an expired fb entry exists', async () => {
    seed('fb', 'GBF-GOAL-A', 'en', 'GBF-GOAL-A', 'identifier', Date.now() - 1)
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('treats now === expiresAt as a hit and now > expiresAt as a miss', async () => {
    vi.useFakeTimers()
    const now = 1_800_000_000_000
    vi.setSystemTime(now)
    seed('api', 'GBF-GOAL-A', 'en', 'cached', 'api', now)
    expect((await mod.resolveTerms(['GBF-GOAL-A'], 'en'))['GBF-GOAL-A']).toEqual({ value: 'cached', source: 'api' })
    expect(fetcher).not.toHaveBeenCalled()

    vi.setSystemTime(now + 1)
    expect((await mod.resolveTerms(['GBF-GOAL-A'], 'en'))['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('writes a one-year expiry for an api hit', async () => {
    await mod.resolveTerms(['GBF-GOAL-A'], 'en')
    const stored = store.get(mod.buildLabelKey('api', 'GBF-GOAL-A', 'en')) as { expiresAt: number }
    expect(stored.expiresAt - Date.now()).toBeGreaterThan(300 * 24 * 60 * 60 * 1000)
  })

  it('ignores a malformed or non-envelope cache entry instead of throwing', async () => {
    store.set(mod.buildLabelKey('api', 'GBF-GOAL-A', 'en'), 'not-json{')
    store.set(mod.buildLabelKey('tr', 'GBF-GOAL-A', 'en'), { value: 42 })
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
  })

  it('reads a JSON-string envelope as well as an object one', async () => {
    store.set(
      mod.buildLabelKey('api', 'GBF-GOAL-A', 'en'),
      JSON.stringify({ value: 'from-string', source: 'api', expiresAt: Date.now() + 60_000 })
    )
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'from-string', source: 'api' })
  })
})

describe('LABEL_CACHE_VERSION', () => {
  it('is embedded in every namespace key', () => {
    const V = mod.LABEL_CACHE_VERSION
    expect(mod.buildLabelKey('api', 'X', 'en')).toBe(`label:api:${V}:X:en`)
    expect(mod.buildLabelKey('tr', 'X', 'en')).toBe(`label:tr:${V}:X:en`)
    expect(mod.buildLabelKey('fb', 'X', 'en')).toBe(`label:fb:${V}:X:en`)
  })

  it('cannot collide two distinct (id, locale) pairs onto one key', () => {
    // `:` is both the separator and legal inside either field, so the raw form made these identical —
    // one term could then read or overwrite another term's cached label.
    expect(mod.buildLabelKey('api', 'a:b', 'c')).not.toBe(mod.buildLabelKey('api', 'a', 'b:c'))
    // unstorage folds `/` and `\\` into `:` at the driver boundary, so those must not survive raw either.
    expect(mod.buildLabelKey('api', 'a/b', 'c')).not.toBe(mod.buildLabelKey('api', 'a', 'b/c'))
    expect(mod.buildLabelKey('api', 'a', 'en')).not.toContain('/')
    // Plain identifiers stay readable in a cache dump.
    expect(mod.buildLabelKey('api', 'GBF-GOAL-A', 'en')).toBe(`label:api:${mod.LABEL_CACHE_VERSION}:GBF-GOAL-A:en`)
  })

  it('keeps one term from serving another term\'s cached label through a colliding key', async () => {
    seed('api', 'a:b', 'c', 'label-for-a:b', 'api', Date.now() + 60_000)
    const out = await mod.resolveTerms(['a'], 'b:c')
    // Before the encoding fix this returned `label-for-a:b` off the other term's entry.
    expect(out['a']).toEqual({ value: 'a', source: 'identifier' })
  })

  it('evicts every prior namespace when bumped', async () => {
    const V = mod.LABEL_CACHE_VERSION
    const future = Date.now() + 60_000
    // Entries written under any other version are unreachable — a bump evicts them all at once.
    for (const tier of ['api', 'tr', 'fb']) {
      store.set(`label:${tier}:${V - 1}:GBF-GOAL-A:en`, { value: 'stale', source: 'api', expiresAt: future })
      store.set(`label:${tier}:${V + 1}:GBF-GOAL-A:en`, { value: 'future', source: 'api', expiresAt: future })
    }
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(store.has(mod.buildLabelKey('api', 'GBF-GOAL-A', 'en'))).toBe(true)
  })
})

describe('resolveTerms — batch behaviour', () => {
  it('matches a partial batch back by .identifier, never by index', async () => {
    const ids = [
      'MISS-1', SIX_LANG.identifier, 'GBF-TARGET-01', 'GBF-GOAL-A', 'CBD-SUBJECT-BIOMES',
      'REGION-AFR-MIDDLE', 'MISS-2', 'CCA4B662-0000-0000-0000-000000000001-DUP', 'GBF-TARGET-01-DUP', 'BIOMES-DUP'
    ]
    const known: Record<string, Record<string, unknown>> = {
      ...TERMS,
      'CCA4B662-0000-0000-0000-000000000001-DUP': { ...SIX_LANG, identifier: 'CCA4B662-0000-0000-0000-000000000001-DUP' },
      'GBF-TARGET-01-DUP': { ...GBF_TARGET_01, identifier: 'GBF-TARGET-01-DUP' },
      'BIOMES-DUP': { ...BIOMES, identifier: 'BIOMES-DUP' }
    }
    // Out-of-order results, two requested ids missing entirely: 10 requested, 8 returned.
    vi.stubGlobal('getThesaurusByKey', vi.fn(async (_e: unknown, keys: string[]) => {
      const hits = keys.map((k) => known[k]).filter(Boolean).reverse()
      return hits.length > 0 ? hits : [false]
    }))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')

    const out = await fresh.resolveTerms(ids, 'en')

    expect(Object.keys(out)).toHaveLength(10)
    expect(out['MISS-1']).toEqual({ value: 'MISS-1', source: 'identifier' })
    expect(out['MISS-2']).toEqual({ value: 'MISS-2', source: 'identifier' })
    expect(out[SIX_LANG.identifier]).toEqual({ value: 'ABS', source: 'api' })
    expect(out['GBF-TARGET-01']).toEqual({ value: 'GBF-T01. Plan and Manage all Areas', source: 'api' })
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
    expect(out['CBD-SUBJECT-BIOMES']).toEqual({ value: 'Biomes', source: 'api' })
    expect(out['REGION-AFR-MIDDLE']).toEqual({ value: 'AFR – Middle', source: 'api' })
    expect(out['BIOMES-DUP']).toEqual({ value: 'Biomes', source: 'api' })
  })

  it('collapses two aliases onto one canonical fetch and keys both results by their requested id', async () => {
    assets.set('thesaurus-aliases:dup.json', { 'ALIAS-ONE': 'GBF-GOAL-A', 'ALIAS-TWO': 'GBF-GOAL-A' })
    const out = await mod.resolveTerms(['ALIAS-ONE', 'ALIAS-TWO'], 'en')
    expect(fetcher.mock.calls[0][1]).toEqual(['GBF-GOAL-A'])
    expect(out['ALIAS-ONE']).toEqual({ value: 'Goal A', source: 'api' })
    expect(out['ALIAS-TWO']).toEqual({ value: 'Goal A', source: 'api' })
  })

  it('degrades when the fetcher returns a non-array', async () => {
    vi.stubGlobal('getThesaurusByKey', vi.fn(async () => ({ not: 'an array' })))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    const out = await fresh.resolveTerms(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'GBF-GOAL-A', source: 'identifier' })
  })

  it('does not double-index an identifier that is already lowercase', async () => {
    vi.stubGlobal('getThesaurusByKey', vi.fn(async () => [{ identifier: 'be', name: 'Belgium' }]))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    expect((await fresh.resolveTerms(['be'], 'en'))['be']).toEqual({ value: 'Belgium', source: 'api' })
  })

  it('issues one batch call and de-duplicates repeated ids', async () => {
    const out = await mod.resolveTerms(['GBF-GOAL-A', 'GBF-GOAL-A', 'CBD-SUBJECT-BIOMES'], 'en')
    expect(Object.keys(out)).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1]).toEqual(['GBF-GOAL-A', 'CBD-SUBJECT-BIOMES'])
  })

  it('fans pass-1 cache reads out across ids instead of serialising them', async () => {
    // This sits on the SSR critical path from p02-06 on; serialised it cost up to 3N round trips before
    // the batch fetch could start.
    let inFlight = 0
    let peak = 0
    vi.stubGlobal('useStorage', () => ({
      getItem: async () => {
        peak = Math.max(peak, ++inFlight)
        await new Promise((r) => setTimeout(r, 1))
        inFlight -= 1
        return null
      },
      setItem: async () => {},
      getKeys: async () => []
    }))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    await fresh.resolveTerms(['GBF-GOAL-A', 'CBD-SUBJECT-BIOMES', 'GBF-TARGET-01', 'MISS-1'], 'en')
    expect(peak).toBeGreaterThan(1)
  })

  it('forwards the event to the existing fetcher', async () => {
    const event = { path: '/en' } as never
    await mod.resolveTerms(['GBF-GOAL-A'], 'en', event)
    expect(fetcher.mock.calls[0][0]).toBe(event)
  })
})

describe('resolveTerms — never throws', () => {
  it.each([
    ['empty array', [] as string[]],
    ['null', null as unknown as string[]],
    ['undefined', undefined as unknown as string[]],
    ['a non-array', 'GBF-GOAL-A' as unknown as string[]],
    ['only invalid entries', [null, '', undefined, 42, {}] as unknown as string[]]
  ])('returns an empty object for %s', async (_label, ids) => {
    await expect(mod.resolveTerms(ids, 'en')).resolves.toEqual({})
  })

  it('survives a storage layer that throws on every operation', async () => {
    vi.stubGlobal('useStorage', () => ({
      getItem: async () => { throw new Error('read failed') },
      setItem: async () => { throw new Error('write failed') }
    }))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    const out = await fresh.resolveTerms(['GBF-GOAL-A', 'MISS-1'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
    expect(out['MISS-1']).toEqual({ value: 'MISS-1', source: 'identifier' })
  })

  it('survives useStorage being unavailable entirely', async () => {
    vi.stubGlobal('useStorage', () => { throw new Error('no mount') })
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    await expect(fresh.resolveTerms(['GBF-GOAL-A'], 'en')).resolves.toEqual({
      'GBF-GOAL-A': { value: 'Goal A', source: 'api' }
    })
  })

  it('degrades an item that resolves with no usable label at all', async () => {
    vi.stubGlobal('getThesaurusByKey', vi.fn(async () => [{ identifier: 'EMPTY-TERM', title: {}, shortTitle: {} }]))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    const out = await fresh.resolveTerms(['EMPTY-TERM'], 'en')
    expect(out['EMPTY-TERM']).toEqual({ value: 'EMPTY-TERM', source: 'identifier' })
  })

  it('isolates an id whose alias lookup blows up', async () => {
    // A map that throws on property access — stands in for any unexpected error in the read pass.
    assets.set('thesaurus-aliases:evil.json', new Proxy({}, {
      get: (_t, prop) => { if (prop === 'GBF-GOAL-A') throw new Error('exploding map'); return undefined }
    }))
    const out = await mod.resolveTerms(['GBF-GOAL-A'], 'en')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'GBF-GOAL-A', source: 'identifier' })
  })

  it('isolates an id whose label pick blows up, leaving the rest of the batch intact', async () => {
    const exploding = { identifier: 'EXPLODING', get shortTitle(): never { throw new Error('bad item') } }
    vi.stubGlobal('getThesaurusByKey', vi.fn(async (_e: unknown, keys: string[]) =>
      keys.map((k) => (k === 'EXPLODING' ? exploding : TERMS[k])).filter(Boolean)))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    const out = await fresh.resolveTerms(['EXPLODING', 'GBF-GOAL-A'], 'en')
    expect(out['EXPLODING']).toEqual({ value: 'EXPLODING', source: 'identifier' })
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
  })

  it('returns __proto__ as an ordinary entry instead of dropping it', async () => {
    // On a plain object literal this assignment mutates the prototype: the entry disappears from the
    // result and the returned object's prototype is re-pointed. From p02-02 on the key is HTTP input.
    const out = await mod.resolveTerms(['__proto__', 'GBF-GOAL-A'], 'en')
    expect(Object.keys(out).sort()).toEqual(['GBF-GOAL-A', '__proto__'])
    expect(out['__proto__']).toEqual({ value: '__proto__', source: 'identifier' })
    expect(Object.getPrototypeOf(out)).toBeNull()
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })

  it('survives consola being absent entirely', async () => {
    // `consola` is a Nitro auto-import; unguarded it throws a ReferenceError from inside `degrade`,
    // which is the never-throw guarantee's own recovery path.
    vi.stubGlobal('consola', undefined)
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    await expect(fresh.resolveTerms(['MISS-1'], 'en')).resolves.toEqual({
      'MISS-1': { value: 'MISS-1', source: 'identifier' }
    })
  })

  it('returns rather than throws when input normalisation itself blows up', async () => {
    // `ids.filter` and `loadAliasMaps` run outside every per-id isolate — only the outer try covers them.
    const hostile = new Proxy(['GBF-GOAL-A'], {
      get: (t, prop, r) => { if (prop === 'filter') throw new Error('hostile ids'); return Reflect.get(t, prop, r) }
    })
    await expect(mod.resolveTerms(hostile, 'en')).resolves.toEqual({})
  })

  it('distinguishes a missing term from one with no usable field in the log', async () => {
    vi.stubGlobal('getThesaurusByKey', vi.fn(async () => [{ identifier: 'EMPTY-TERM', title: {}, shortTitle: {} }]))
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    await fresh.resolveTerms(['EMPTY-TERM'], 'en')
    expect(warn).toHaveBeenCalledWith('resolveTerms: no usable label field', { identifier: 'EMPTY-TERM', locale: 'en' })
  })

  it('defaults a blank locale to en', async () => {
    const out = await mod.resolveTerms(['GBF-GOAL-A'], '   ')
    expect(out['GBF-GOAL-A']).toEqual({ value: 'Goal A', source: 'api' })
    expect(store.has(mod.buildLabelKey('api', 'GBF-GOAL-A', 'en'))).toBe(true)
  })
})

describe('resolveAlias', () => {
  it('is the identity function while server/assets/thesaurus-aliases/ is empty', async () => {
    await mod.loadAliasMaps()
    expect(mod.resolveAlias('SDG-GOAL-01')).toBe('SDG-GOAL-01')
    expect(mod.resolveAlias('CBD-SUBJECT-ABS')).toBe('CBD-SUBJECT-ABS')
    expect(mod.resolveAlias('')).toBe('')
  })

  it('is the identity function before any load has happened', () => {
    expect(mod.resolveAlias('SDG-GOAL-01')).toBe('SDG-GOAL-01')
  })

  it('applies a dropped-in alias map, object or JSON string', async () => {
    assets.set('thesaurus-aliases:sdg.json', { 'SDG-GOAL-01': 'SUSTAINABLE-DEVELOPMENT-GOAL-01' })
    assets.set('thesaurus-aliases:iso2.json', JSON.stringify({ BE: 'BEL' }))
    assets.set('thesaurus-aliases:broken.json', 'not json {')
    assets.set('thesaurus-aliases:README.md', 'ignored')
    await mod.loadAliasMaps()
    expect(mod.resolveAlias('SDG-GOAL-01')).toBe('SUSTAINABLE-DEVELOPMENT-GOAL-01')
    expect(mod.resolveAlias('BE')).toBe('BEL')
    expect(mod.resolveAlias('UNKNOWN')).toBe('UNKNOWN')
  })

  it('resolves through the alias before fetching, and keys the result by the requested id', async () => {
    assets.set('thesaurus-aliases:sdg.json', { 'SDG-GOAL-01': 'GBF-GOAL-A' })
    const out = await mod.resolveTerms(['SDG-GOAL-01'], 'en')
    expect(fetcher.mock.calls[0][1]).toEqual(['GBF-GOAL-A'])
    expect(out['SDG-GOAL-01']).toEqual({ value: 'Goal A', source: 'api' })
    expect(store.has(mod.buildLabelKey('api', 'SDG-GOAL-01', 'en'))).toBe(true)
  })

  it('refuses to look up or return an identifier outside the accepted shape', async () => {
    assets.set('thesaurus-aliases:evil.json', {
      '../../admin': 'HIJACKED',
      'OK-KEY': '../../../etc/passwd',
      'GOOD-KEY': 'GOOD-CANONICAL'
    })
    await mod.loadAliasMaps()
    // A key that is not a valid identifier is never looked up at all.
    expect(mod.resolveAlias('../../admin')).toBe('../../admin')
    // A mapped VALUE that is not a valid identifier never escapes the seam.
    expect(mod.resolveAlias('OK-KEY')).toBe('OK-KEY')
    // A valid pair still maps.
    expect(mod.resolveAlias('GOOD-KEY')).toBe('GOOD-CANONICAL')
  })

  it('retries after a transient asset-store failure instead of disabling aliases for the process', async () => {
    let calls = 0
    vi.stubGlobal('useStorage', (group: string) => {
      if (group !== 'assets:server') return { getItem: async () => null, setItem: async () => {}, getKeys: async () => [] }
      calls += 1
      if (calls === 1) throw new Error('transient EIO')
      return {
        getItem: async () => ({ 'SDG-GOAL-01': 'GBF-GOAL-A' }),
        setItem: async () => {},
        getKeys: async () => ['thesaurus-aliases:sdg.json']
      }
    })
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')

    await fresh.loadAliasMaps()
    expect(fresh.resolveAlias('SDG-GOAL-01')).toBe('SDG-GOAL-01')
    expect(warn).toHaveBeenCalledWith(
      'resolveTerms: alias maps unavailable, aliasing disabled until the next successful load',
      undefined
    )

    // Before the fix the empty memo was permanent and this second load made zero further asset calls.
    // The warning is emitted once, not on every retry.
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('alias maps unavailable'))).toHaveLength(1)
    await fresh.loadAliasMaps()
    expect(calls).toBeGreaterThan(1)
    expect(fresh.resolveAlias('SDG-GOAL-01')).toBe('GBF-GOAL-A')
  })

  it('stays an identity function when asset storage is unavailable', async () => {
    vi.stubGlobal('useStorage', () => { throw new Error('no assets') })
    vi.resetModules()
    const fresh = await import('../../../../../server/utils/thesaurus/resolve-terms')
    await fresh.loadAliasMaps()
    expect(fresh.resolveAlias('SDG-GOAL-01')).toBe('SDG-GOAL-01')
  })
})
