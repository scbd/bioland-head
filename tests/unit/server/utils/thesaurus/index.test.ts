import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { getLocalizedName } from '~/server/utils/thesaurus/sanitizers'

// Bind the Nitro auto-imports server/utils/thesaurus/index.js relies on before importing
// it in plain-Node Vitest (mirrors tests/unit/server/api/chm-network/index.test.ts).
const runtimeConfig = { public: { gaiaApi: 'https://api.test.cbd.int/api' } }
let fetchedUrl: string | undefined
let fetchResponse: any
let fetchError: Error | undefined
let currentLocale = 'en'

vi.stubGlobal('defineCachedFunction', (fn: (...args: any[]) => any) => fn)
vi.stubGlobal('getThesaurusCacheOptions', vi.fn(() => ({})))
vi.stubGlobal('consola', { error: vi.fn(), debug: vi.fn(), warn: vi.fn() })
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)
vi.stubGlobal('$fetchBaseOptions', (opts: Record<string, unknown> = {}) => opts)
vi.stubGlobal('getLocalizedName', getLocalizedName)
vi.stubGlobal('useRequestContext', vi.fn(async () => ({ locale: currentLocale })))
vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
  fetchedUrl = url
  if (fetchError) throw fetchError
  return fetchResponse
}))

let thesaurusIndex: typeof import('~/server/utils/thesaurus/index.js')

describe('thesaurus/index', () => {
  beforeAll(async () => {
    thesaurusIndex = await import('~/server/utils/thesaurus/index.js')
  })

  beforeEach(() => {
    fetchedUrl = undefined
    fetchResponse = undefined
    fetchError = undefined
    currentLocale = 'en'
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  describe('sdgsData / getSdg / extractNumberFromKey (unchanged by p01-01, real import)', () => {
    it('contains all 17 SDGs', () => {
      expect(thesaurusIndex.sdgsData).toHaveLength(17)
    })

    it('returns an SDG by identifier', () => {
      const sdg13 = thesaurusIndex.getSdg('SDG-GOAL-13')
      expect(sdg13?.name).toContain('Climate')
    })

    it('returns undefined for an unknown SDG identifier', () => {
      expect(thesaurusIndex.getSdg('SDG-GOAL-99')).toBeUndefined()
    })

    it('extracts the numeric segment from a dashed key', () => {
      expect(thesaurusIndex.extractNumberFromKey('ort-nr7-123-something')).toBe('123')
    })

    it('returns null when no numeric segment is present', () => {
      expect(thesaurusIndex.extractNumberFromKey('no-number-here')).toBeNull()
    })
  })

  describe('getCountryName', () => {
    it('returns the localized label via shortTitle -> title -> name, not the raw plain-English name', async () => {
      fetchResponse = {
        identifier: 'BE',
        name: 'Belgium',
        title: { en: 'Belgium', fr: 'Belgique' },
        shortTitle: { en: 'BE', fr: 'BE' }
      }
      currentLocale = 'fr'

      const result = await thesaurusIndex.getCountryName({}, 'BE')

      expect(result).toBe('BE')
      expect(fetchedUrl).toContain('/v2013/thesaurus/terms/BE')
    })

    it('falls back to title when shortTitle is empty for the requested locale, still localized', async () => {
      fetchResponse = {
        identifier: 'FR',
        name: 'France',
        title: { en: 'France', es: 'Francia' },
        shortTitle: {}
      }
      currentLocale = 'es'

      const result = await thesaurusIndex.getCountryName({}, 'FR')

      expect(result).toBe('Francia')
    })

    it('falls back to the plain-English name only when neither multilingual field carries data', async () => {
      fetchResponse = { identifier: 'ZZ', name: 'Plain Country' }
      currentLocale = 'de'

      const result = await thesaurusIndex.getCountryName({}, 'ZZ')

      expect(result).toBe('Plain Country')
    })

    it('defaults to English when the request context carries no locale', async () => {
      fetchResponse = { identifier: 'BE', name: 'Belgium', title: { en: 'Belgium', fr: 'Belgique' } }
      currentLocale = ''

      const result = await thesaurusIndex.getCountryName({}, 'BE')

      expect(result).toBe('Belgium')
    })

    it('returns undefined without a status code when the fetch rejects outright (network failure)', async () => {
      fetchError = new Error('network down')

      const result = await thesaurusIndex.getCountryName({}, 'ZZ')

      expect(result).toBeUndefined()
      expect(globalThis.consola.error).toHaveBeenCalled()
    })

    it('returns undefined and does not throw when the fetch fails (404-shaped response)', async () => {
      fetchResponse = { status: 404 }

      const result = await thesaurusIndex.getCountryName({}, 'SDG-GOAL-01')

      expect(result).toBeUndefined()
      expect(globalThis.consola.error).toHaveBeenCalled()
    })

    it('URI-encodes the identifier', async () => {
      fetchResponse = { identifier: 'A B', name: 'A B' }

      await thesaurusIndex.getCountryName({}, 'A B')

      expect(fetchedUrl).toContain(encodeURIComponent('A B'))
    })
  })
})
