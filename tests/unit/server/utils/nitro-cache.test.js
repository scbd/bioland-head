import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../shared/utils/constants'

let cache

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('useRequestContext', vi.fn(async () => ({ multiSiteCode: 'bl2', siteCode: 'be', locale: 'en' })))
  vi.stubGlobal('getRequestURL', vi.fn(() => new URL('https://be.example.test/en')))
  vi.stubGlobal('getHeader', vi.fn(() => ''))
  cache = await import('~/server/utils/nitro-cache')
})

afterEach(() => vi.unstubAllGlobals())

describe('nitro-cache negative-entry guard', () => {
  it.each([undefined, null])('rejectNullish refuses a %s value', (value) => {
    expect(cache.rejectNullish({ value })).toBe(false)
  })

  it.each([[], {}, 0, '', false, { a: 1 }])('rejectNullish keeps %j - empties are real answers', (value) => {
    expect(cache.rejectNullish({ value })).toBe(true)
  })

  it('every options helper carries the guard so no defineCachedFunction user can persist a miss', () => {
    for (const options of [
      cache.getBaseCacheOptions('g', 'n'),
      cache.getMenusCacheOptions('n'),
      cache.getExternalCacheOptions('n'),
      cache.getExternalShortCacheOptions('n'),
      cache.getListCacheOptions('n'),
      cache.getThesaurusCacheOptions('n'),
      cache.getUserCacheOptions('n'),
    ]) {
      expect(options.validate).toBe(cache.rejectNullish)
    }
  })
})

describe('getUserCacheOptions key', () => {
  it('scopes a session to its tenant, resolved from the request rather than event.context.site', async () => {
    const { getKey } = cache.getUserCacheOptions('get-cached-user')
    getHeader.mockReturnValue('SSESSabc=session-1')
    useRequestContext.mockResolvedValueOnce({ multiSiteCode: 'bl2', siteCode: 'be' })
    const be = await getKey({ context: {} })
    useRequestContext.mockResolvedValueOnce({ multiSiteCode: 'bl2', siteCode: 'fr' })
    const fr = await getKey({ context: {} })
    expect(be).toMatch(/^bl2:be:/)
    expect(fr).toMatch(/^bl2:fr:/)
    expect(be).not.toBe(fr)
  })

  it('refuses to key a session without a tenant', async () => {
    const { getKey } = cache.getUserCacheOptions('get-cached-user')
    useRequestContext.mockResolvedValueOnce({})
    await expect(getKey({ context: {} })).rejects.toThrow(/without a tenant/)
  })
})
