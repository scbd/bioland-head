import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// Bind the Nitro/Nuxt auto-imports cbd-index.js relies on before importing it in plain-Node Vitest.
vi.stubGlobal('useRuntimeConfig', () => ({ public: { gaiaApi: 'https://gaia.test' } }))
vi.stubGlobal('$fetchBaseOptions', (o) => o)
vi.stubGlobal('consola', { error: vi.fn() })
// getAllBySchemas wraps its resolver at module load time - stub the cache wrapper as an
// identity so importing the module doesn't require a real Nitro cache runtime.
vi.stubGlobal('defineCachedFunction', (fn) => fn)
vi.stubGlobal('getListCacheOptions', () => ({}))

let queryScbdIndex, $fetch

describe('cbd-index queryScbdIndex countryString (BL-1135 D1)', () => {
  beforeAll(async () => {
    ;({ queryScbdIndex } = await import('~/server/utils/cbd-index.js'))
  })

  beforeEach(() => {
    $fetch = vi.fn(async () => ({ response: { docs: [], numFound: 0 }, facet_counts: {} }))
    vi.stubGlobal('$fetch', $fetch)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('does not append the literal "undefined" when only `countries` is set (multi-country site)', async () => {
    await queryScbdIndex({ countries: ['TH'], country: undefined, schemas: ['nationalTarget7'], locale: 'en' })

    const [, options] = $fetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(JSON.stringify(body)).not.toMatch(/undefined/)
    expect(JSON.stringify(body)).toContain('TH')
  })

  it('still includes both `country` and `countries` when both are set', async () => {
    await queryScbdIndex({ countries: ['TH'], country: 'TH', schemas: ['nationalTarget7'], locale: 'en' })

    const [, options] = $fetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(JSON.stringify(body)).not.toMatch(/undefined/)
    expect(JSON.stringify(body)).toContain('TH')
  })
})
