import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BL-1126: Drupal linkset hrefs carry the Drupal prefix (/fil/...) while the app locale is tl.
const linkset = (items) => ({ linkset: [{ item: items }] })
const item = (href, hierarchy) => ({ href, title: href, hierarchy, class: [] })

let getDrupalMenus, $fetch

beforeEach(async () => {
  vi.resetModules()
  $fetch = vi.fn(async (uri) => uri.endsWith('/system/menu/main/linkset')
    ? linkset([item('/fil/about', ['0']), item('/fil/about/team', ['0', '0']), item('/en/other', ['1']), item('https://example.org/fil/x', ['2'])])
    : linkset([]))
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('$fetchBaseOptions', (o) => o)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { multiSiteCode: 'bl2' } }))
  vi.stubGlobal('useDrupalLogin', async () => ({ get: () => ({ withCredentials: () => ({ accept: async () => ({ body: { data: [], links: {} } }) }) }) }))
  vi.stubGlobal('consola', { error: vi.fn(), warn: vi.fn(), debug: vi.fn() })
  ;({ getDrupalMenus } = await import('~/server/utils/menus/drupal-menus.js'))
})

afterEach(() => vi.unstubAllGlobals())

describe('getDrupalMenus href normalization', () => {
  it('maps the Drupal /fil/ prefix back to the app /tl/ locale', async () => {
    const { main } = await getDrupalMenus({ locale: 'tl', localizedHost: 'https://seed.test/fil', host: 'https://seed.test' })

    expect($fetch).toHaveBeenCalledWith('https://seed.test/fil/system/menu/main/linkset', expect.anything())
    expect(main.map(({ href }) => href)).toEqual(['/tl/about', '/en/other', 'https://example.org/fil/x'])
    expect(main[0].children[0].href).toBe('/tl/about/team')
    expect(main[0].crumbs[0].href).toBe('/tl/about')
  })
})
