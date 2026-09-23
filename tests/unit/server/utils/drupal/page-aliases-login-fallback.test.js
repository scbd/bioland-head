import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../../shared/utils/constants'
import { getBaseCacheOptions, rejectNullish } from '~/server/utils/nitro-cache'
import { mapLocaleFromDrupal } from '~/server/utils/translate/locale.js'

// BL-1113: an open Drupal login breaker (503) used to fail the whole page on the alias map.

const ctx = {
  multiSiteCode: 'bl2',
  siteCode     : 'asean',
  host         : 'https://asean.test',
  localizedHost: 'https://asean.test/en',
  locale       : 'en',
  locales      : ['en', 'fr'],
  path         : '/en/about',
}
const event = { context: { headers: {} } }

const loginUnavailable = () => createError({ statusCode: 503, statusMessage: 'Drupal login unavailable', data: { siteCode: 'asean', reason: 'failure-backoff' } })

let drupalPage, consola, useDrupalLogin, entity

// A path_alias request answered with the given rows, in superagent's chained shape.
const drupalSession = (rows) => {
  const request = { query: () => request, withCredentials: () => request, accept: async () => ({ body: { data: rows } }) }
  return { get: () => request }
}

function drupal(uri) {
  if (uri.includes('/router/translate-path'))
    return Promise.resolve({ entity: { uuid: 'u-1', type: 'node', bundle: 'content', canonical: `${ctx.host}${ctx.path}` }, label: 'About' })

  return Promise.resolve({ data: { ...entity, default_langcode: true } })
}

beforeEach(async () => {
  vi.resetModules()
  entity         = { drupal_internal__nid: 42 }
  consola        = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  useDrupalLogin = vi.fn(() => Promise.reject(loginUnavailable()))

  vi.stubGlobal('$fetch', vi.fn(drupal))
  vi.stubGlobal('$fetchBaseOptions', (o = {}) => o)
  vi.stubGlobal('consola', consola)
  vi.stubGlobal('createError', (e) => Object.assign(new Error(e.message ?? e.statusMessage), e))
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('getBaseCacheOptions', getBaseCacheOptions)
  vi.stubGlobal('rejectNullish', rejectNullish)
  vi.stubGlobal('defineCachedFunction', (fn) => fn)
  vi.stubGlobal('useDrupalLogin', useDrupalLogin)
  vi.stubGlobal('getInstalledLanguages', async () => [{ drupalInternalId: 'en' }, { drupalInternalId: 'fr' }])
  vi.stubGlobal('mapLocaleFromDrupal', mapLocaleFromDrupal)
  vi.stubGlobal('removeLocalizationFromPath', (await import('~/server/utils/drupal/index.js')).removeLocalizationFromPath)
  vi.stubGlobal('mapAliasByLocale', (await import('~/server/utils/drupal/drupal-path-alias.js')).mapAliasByLocale)

  drupalPage = await import('~/server/utils/drupal/drupal-page.js')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getPageData when the Drupal login breaker is open (BL-1113)', () => {
  it.each([
    [{ drupal_internal__nid: 42 }, { en: '/en/node/42', fr: '/fr/node/42' }],
    [{ drupal_internal__mid: 99 }, { en: '/en/media/99', fr: '/fr/media/99' }],
    [{ drupal_internal__tid: 77 }, { en: '/en/taxonomy/term/77', fr: '/fr/taxonomy/term/77' }],
  ])('renders %o with a plain language map', async (ids, aliases) => {
    entity = ids

    await expect(drupalPage.getPageData({ ...ctx }, event)).resolves.toMatchObject({ aliases })
  })

  it('prefers the node id over the others, as the alias lookup does', async () => {
    entity = { drupal_internal__nid: 42, drupal_internal__mid: 99, drupal_internal__tid: 77 }

    await expect(drupalPage.getPageData({ ...ctx }, event)).resolves.toMatchObject({ aliases: { en: '/en/node/42', fr: '/fr/node/42' } })
  })

  it('emits no links when the entity carries no id', async () => {
    entity = {}

    await expect(drupalPage.getPageData({ ...ctx }, event)).resolves.toMatchObject({ aliases: {} })
  })

  it('warns once with plain fields and logs no error', async () => {
    await drupalPage.getPageData({ ...ctx }, event)

    expect(consola.warn).toHaveBeenCalledTimes(1)
    const [, details] = consola.warn.mock.calls[0]
    expect(details).toEqual({ siteCode: 'asean', statusCode: 503, message: 'Drupal login unavailable' })
    expect(Object.values(details).some((v) => v instanceof Error)).toBe(false)
    expect(consola.error).not.toHaveBeenCalled()
  })

  it('still fails the page on any other alias failure', async () => {
    useDrupalLogin.mockImplementation(() => Promise.reject(createError({ statusCode: 403, statusMessage: 'Forbidden' })))

    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 403 })
    expect(consola.warn).not.toHaveBeenCalled()
  })

  it('uses the real aliases when login succeeds', async () => {
    useDrupalLogin.mockResolvedValue(drupalSession([
      { langcode: 'en', alias: '/about',   path: '/node/42' },
      { langcode: 'fr', alias: '/a-propos', path: '/node/42' },
    ]))

    await expect(drupalPage.getPageData({ ...ctx }, event)).resolves.toMatchObject({ aliases: { en: '/en/about', fr: '/fr/a-propos' } })
    expect(consola.warn).not.toHaveBeenCalled()
  })
})
