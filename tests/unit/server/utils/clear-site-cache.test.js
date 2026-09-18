import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../shared/utils/constants'

/**
 * A fake fs-like store: getKeys(base) lists only keys under that base, like the unstorage
 * fs driver reading one subdirectory.
 */
const makeStore = (keys) => {
  const live = new Set(keys)
  const scannedBases = []
  return {
    scannedBases,
    live,
    // Like the unstorage fs driver: the base argument is ignored and the whole tree comes back.
    getKeys: vi.fn(async (base) => { scannedBases.push(base); return [...live] }),
    removeItem: vi.fn(async (k) => { live.delete(k) }),
  }
}

let cache, store

beforeEach(async () => {
  vi.resetModules()
  store = makeStore([
    'context:get-dmsm-config:bl2:be.json',
    'context:get-site-settings:bl2:be:en.json',
    'menus:menus-index:bl2:be:en.json',
    'menus:menus-index:bl2:fr:en.json',
    'lists:get-all-by-schemas:bl2-be-en-absch.json',
    'lists:get-all-by-schemas:bl2-fr-en-absch.json',
    'external:panorama:bl2:be:en.json',
    'users:get-cached-user:bl2:be:abc123.json',
    'thesaurus:thesaurus-source-map:thesaurus-source-map.json',
    'thesaurus:get-thesaurus-by-key:bl2:be:en:CBD-SUBJECT-1.json',
    'sitemaps:bl2-be-behost-en.xml',
  ])
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('useStorage', vi.fn(() => store))
  vi.stubGlobal('useRequestContext', vi.fn(async () => ({ multiSiteCode: 'bl2', siteCode: 'be' })))
  vi.stubGlobal('getRequestURL', vi.fn())
  vi.stubGlobal('getHeader', vi.fn(() => ''))
  cache = await import('~/server/utils/nitro-cache')
})

afterEach(() => vi.unstubAllGlobals())

describe('clearSiteCache', () => {
  it('walks the store once and narrows to the per-Site groups in-process', async () => {
    await cache.clearSiteCache({}, { multiSiteCode: 'bl2', siteCode: 'be' })
    expect(store.getKeys).toHaveBeenCalledTimes(1)
    expect(store.getKeys).toHaveBeenCalledWith()
    expect(cache.SITE_SCOPED_CACHE_GROUPS).not.toContain('users')
  })

  it('removes every entry for the Site across key formats and keeps other Sites', async () => {
    const result = await cache.clearSiteCache({}, { multiSiteCode: 'bl2', siteCode: 'be' })
    expect(result.deleted.sort()).toEqual([
      'context:get-dmsm-config:bl2:be.json',
      'context:get-site-settings:bl2:be:en.json',
      'external:panorama:bl2:be:en.json',
      'lists:get-all-by-schemas:bl2-be-en-absch.json',
      'menus:menus-index:bl2:be:en.json',
      'sitemaps:bl2-be-behost-en.xml',
      'thesaurus:get-thesaurus-by-key:bl2:be:en:CBD-SUBJECT-1.json',
    ])
    expect(result.errors).toEqual([])
    expect([...store.live]).toEqual(expect.arrayContaining([
      'menus:menus-index:bl2:fr:en.json',
      'lists:get-all-by-schemas:bl2-fr-en-absch.json',
      'users:get-cached-user:bl2:be:abc123.json',
      'thesaurus:thesaurus-source-map:thesaurus-source-map.json',
    ]))
  })

  it('derives the Site from the request context when not given, bypassing the cache to do so', async () => {
    const event = {}
    const result = await cache.clearSiteCache(event)
    expect(useRequestContext).toHaveBeenCalledWith(event, { bypassCache: true })
    expect(result).toMatchObject({ multiSiteCode: 'bl2', siteCode: 'be', count: 7 })
  })

  it('reports per-key removal failures without aborting the sweep', async () => {
    store.removeItem.mockImplementationOnce(async () => { throw new Error('EACCES') })
    const result = await cache.clearSiteCache({}, { multiSiteCode: 'bl2', siteCode: 'be' })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/EACCES/)
    expect(result.count).toBe(6)
  })
})
