import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../shared/utils/constants'
import { identifierToKey } from '~/server/utils/nitro-cache'

/**
 * Nitro passes the resolver's ARGUMENTS to getKey. These two functions were keyed with
 * a different signature than their resolver, so unrelated queries shared one entry.
 */
let captured

beforeEach(() => {
  vi.resetModules()
  captured = {}
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { multiSiteCode: 'bl2' } }))
  vi.stubGlobal('useRequestContext', vi.fn())
  vi.stubGlobal('getRequestURL', vi.fn())
  vi.stubGlobal('getHeader', vi.fn(() => ''))
  vi.stubGlobal('identifierToKey', identifierToKey)
  vi.stubGlobal('getListCacheOptions', (name) => ({ name }))
  vi.stubGlobal('defineCachedFunction', (fn, options) => { captured[options.name] = options; return fn })
})

afterEach(() => vi.unstubAllGlobals())

const ctx = { multiSiteCode: 'bl2', siteCode: 'be', locale: 'en', defaultLocale: 'en' }

describe('getAllBySchemas cache key', () => {
  beforeEach(async () => { await import('~/server/utils/cbd-index.js') })

  it('is built from the schemas and countries arguments, not from ctx', () => {
    const key = captured['get-all-by-schemas'].getKey(ctx, ['nationalReport7', 'absch'], ['BE'])
    expect(key).toBe('bl2-be-en-absch-nationalReport7-BE')
  })

  it('separates queries that only differ by schema or country', () => {
    const { getKey } = captured['get-all-by-schemas']
    const keys = new Set([
      getKey(ctx, ['a']),
      getKey(ctx, ['b']),
      getKey(ctx, ['a'], ['BE']),
      getKey(ctx, ['a'], ['FR']),
    ])
    expect(keys.size).toBe(4)
  })

  it('is order-insensitive within a query', () => {
    const { getKey } = captured['get-all-by-schemas']
    expect(getKey(ctx, ['b', 'a'], ['FR', 'BE'])).toBe(getKey(ctx, ['a', 'b'], ['BE', 'FR']))
  })
})

describe('getFacetsInDefaultLocale cache key', () => {
  beforeEach(async () => { await import('~/server/utils/lists/content-index.js') })

  it('names the site and default locale from ctx, the first resolver argument', () => {
    const key = captured['get-facets-in-default-locale'].getKey(ctx, ['u1'])
    expect(key).toMatch(/^bl2:be:en:/)
    expect(key).not.toContain('undefined')
  })

  it('separates sites and uuid sets', () => {
    const { getKey } = captured['get-facets-in-default-locale']
    const keys = new Set([
      getKey(ctx, ['u1']),
      getKey(ctx, ['u2']),
      getKey(ctx, ['u1', 'u2']),
      getKey({ ...ctx, siteCode: 'fr' }, ['u1']),
    ])
    expect(keys.size).toBe(4)
  })

  it('is order-insensitive across the uuid set and bounded in length', () => {
    const { getKey } = captured['get-facets-in-default-locale']
    const many = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect(getKey(ctx, [...many].reverse())).toBe(getKey(ctx, many))
    expect(getKey(ctx, many).length).toBeLessThan(80)
  })
})
