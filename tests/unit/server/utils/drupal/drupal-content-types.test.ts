import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useContentTypeMenus } from '~/server/utils/drupal/drupal-content-types.js'
import { getPaginationParams } from '~/server/utils/lists/index.js'

const ctx = {
  siteCode: 'be', env: 'dev', multiSiteCode: 'bl2', locale: 'en',
  localizedHost: 'https://drupal.example.test/en',
}
const log = { error: vi.fn(), warn: vi.fn() }
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('consola', log)
  vi.stubGlobal('useDrupalLogin', vi.fn().mockResolvedValue(null))
  vi.stubGlobal('$fetchBaseOptions', (options: unknown) => options)
  vi.stubGlobal('mapLocaleFromDrupal', (locale: string) => locale)
  vi.stubGlobal('slugify', (value: string) => value.toLowerCase())
  vi.stubGlobal('buildDrupalLanguageFilter', () => '')
  vi.stubGlobal('getPaginationParams', getPaginationParams)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
  fetchMock.mockImplementation(async (uri: string) => uri.includes('/taxonomy_term/')
    ? { data: [12, 13].map(id => ({
        drupal_internal__tid: id, status: true, langcode: 'en',
        name: `Type${id}`, field_plural: `Types${id}`,
      })) }
    : { data: [], meta: { count: 0 } })
  vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const requestedLimits = () => fetchMock.mock.calls
  .filter(([uri]) => uri.includes('/index/content'))
  .map(([uri]) => new URL(uri).searchParams.get('page[limit]'))

describe('content type menu limits', () => {
  it.each([undefined, {}, { megaMenu: {} }])(
    'reports missing menu settings once while loading every content type: %j',
    async biolandSettings => {
      const menus = await useContentTypeMenus({ ...ctx, biolandSettings })

      expect(Object.keys(menus)).toEqual(['types12', 'types13'])
      expect(requestedLimits()).toEqual(['6', '6'])
      expect(log.error).not.toHaveBeenCalled()
      expect(log.warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('biolandSettings.megaMenu.contentTypeMenus'),
        { siteCode: 'be', env: 'dev', multiSiteCode: 'bl2' },
      )
    },
  )

  it('uses authored limits and the default for an unauthored type without warnings', async () => {
    await useContentTypeMenus({ ...ctx, biolandSettings: {
      megaMenu: { contentTypeMenus: { 12: { maxMenus: 3 } } },
    } })

    expect(requestedLimits()).toEqual(['3', '6'])
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })

  it('accepts installation defaults before any per-type settings are saved', async () => {
    await useContentTypeMenus({ ...ctx, biolandSettings: {
      megaMenu: { contentTypeMenus: { visibleContentTypeMenus: [] } },
    } })

    expect(requestedLimits()).toEqual(['6', '6'])
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })
})
