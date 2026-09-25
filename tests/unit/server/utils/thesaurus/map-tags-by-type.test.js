import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dataSourceConfigs, GOV_TYPE_IDS } from '~/server/utils/thesaurus/config'

// Real source map + real config; only the thesaurus API and Nitro globals are stubbed, so
// each term is classified by the term set it belongs to, exactly as in production.
const url = (domain) => dataSourceConfigs[domain].url
const GOV_ID = [...GOV_TYPE_IDS][0]
const SUB_NATIONAL = 'DEBB019D-8647-40EC-8AE5-10CA88572F6E'
const termSets = {
  [url('countries')]: [{ identifier: 'CA' }],
  [url('subjects')]: [{ identifier: 'CBD-SUBJECT-AGR' }],
  [url('documentTypes')]: [{ identifier: 'DOC-TYPE-1' }, { identifier: 'DOC-TYPE-2' }],
  [url('eventStatuses')]: [{ identifier: 'EVENT-STATUS-1' }],
  [url('projectStatuses')]: [{ identifier: 'PROJECT-STATUS-1' }],
  [url('geoScopes')]: [{ identifier: 'GEO-SCOPE-1' }, { identifier: SUB_NATIONAL }],
  [url('jurisdictions')]: [{ identifier: SUB_NATIONAL }],
  // orgTypes and govTypes are the same API term set
  [url('orgTypes')]: [{ identifier: 'ORG-TYPE-1' }, { identifier: GOV_ID }],
  [url('bchSubjects')]: [{ identifier: 'BCH-SUBJECT-1' }],
}

let thesaurus, storage

beforeEach(async () => {
  vi.resetModules()
  storage = new Map()
  vi.stubGlobal('$fetch', vi.fn(async (u) => termSets[u] || []))
  vi.stubGlobal('consola', { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() })
  vi.stubGlobal('defineCachedFunction', (fn) => fn)
  vi.stubGlobal('getThesaurusCacheOptions', () => ({}))
  vi.stubGlobal('CACHE_TTL', { ONE_YEAR: 1 })
  vi.stubGlobal('useStorage', () => ({ getItem: async (k) => storage.get(k), setItem: async (k, v) => storage.set(k, v) }))
  const sourceMap = await import('~/server/utils/thesaurus/source-map')
  vi.stubGlobal('getDomainByIdentifier', sourceMap.getDomainByIdentifier)
  thesaurus = await import('~/server/utils/thesaurus/index.js')
})

afterEach(() => vi.unstubAllGlobals())

const ids = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.map((t) => t.identifier)]))

describe('mapTagsByType', () => {
  it('buckets every additional tag term by its term set', async () => {
    const map = await thesaurus.mapTagsByType([
      { identifier: 'DOC-TYPE-1' }, { identifier: 'DOC-TYPE-2' }, { identifier: 'EVENT-STATUS-1' },
      { identifier: 'PROJECT-STATUS-1' }, { identifier: 'GEO-SCOPE-1' }, { identifier: SUB_NATIONAL },
      { identifier: 'ORG-TYPE-1' }, { identifier: GOV_ID }, { identifier: 'T1.1' }, { identifier: 'BCH-SUBJECT-1' },
    ])

    expect(ids(map)).toEqual({
      documentTypes: ['DOC-TYPE-1', 'DOC-TYPE-2'],
      eventStatuses: ['EVENT-STATUS-1'],
      projectStatuses: ['PROJECT-STATUS-1'],
      geoScopes: ['GEO-SCOPE-1', SUB_NATIONAL],
      orgTypes: ['ORG-TYPE-1'],
      govTypes: [GOV_ID],
      ecosystemTypes: ['T1.1'],
      bchSubjects: ['BCH-SUBJECT-1'],
    })
  })

  it('files every government type id under govTypes, not orgTypes', async () => {
    const map = await thesaurus.mapTagsByType([...GOV_TYPE_IDS].map((identifier) => ({ identifier })))

    expect(Object.keys(map)).toEqual(['govTypes'])
    expect(map.govTypes).toHaveLength(GOV_TYPE_IDS.size)
  })

  it('keeps the pattern-matched buckets unchanged', async () => {
    const map = await thesaurus.mapTagsByType([
      { identifier: 'CA' }, { identifier: 'GBF-TARGET-01' }, { identifier: 'AICHI-TARGET-01' },
      { identifier: 'SDG-GOAL-15' }, { identifier: 'CBD-SUBJECT-AGR' }, { identifier: 'ort-nr7-1' },
    ])

    expect(ids(map)).toEqual({
      countries: ['CA'], gbfTargets: ['GBF-TARGET-01'], aichis: ['AICHI-TARGET-01'],
      sdgs: ['SDG-GOAL-15'], subjects: ['CBD-SUBJECT-AGR'], nr7s: ['ort-nr7-1'],
    })
  })

  it('files a static id even when the not-found list already holds it', async () => {
    storage.set('term-not-found', JSON.stringify(['T1.1', 'NOPE']))

    const map = await thesaurus.mapTagsByType([{ identifier: 'T1.1' }, { identifier: 'NOPE' }])

    expect(ids(map)).toEqual({ ecosystemTypes: ['T1.1'] })
  })

  it('drops unknown identifiers and returns undefined for no tags', async () => {
    expect(await thesaurus.mapTagsByType([{ identifier: 'NOPE' }, {}, null])).toEqual({})
    expect(await thesaurus.mapTagsByType(undefined)).toBeUndefined()
  })
})

describe('getThesaurusByKey', () => {
  it('resolves ecosystem types from the static term set without calling the thesaurus API', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { gaiaApi: 'https://gaia.test' } }))
    vi.stubGlobal('$fetchBaseOptions', (o) => o)

    const [term] = await thesaurus.getThesaurusByKey({}, 'T1.1')

    expect(term).toEqual({ identifier: 'T1.1', name: 'Tropical/Subtropical lowland rainforests', title: { en: 'Tropical/Subtropical lowland rainforests' } })
    expect($fetch).not.toHaveBeenCalledWith(expect.stringContaining('gaia.test'), expect.anything())
  })
})
