import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapLocaleFromDrupal } from '~/server/utils/translate/locale.js'

// BL-838: without a homePath nothing is the home path (the old fallback was a misspelt term 20).

const ctx = { siteCode: 'be', localizedHost: 'https://be.test/en', locale: 'en', locales: ['en', 'fr'] }

let mapAliasByLocale

// path_alias answers with no rows, so every locale falls back to the system path (or '' for home).
const noAliases = () => {
  const request = { query: () => request, withCredentials: () => request, accept: async () => ({ body: { data: [] } }) }
  return { get: () => request }
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('useDrupalLogin', async () => noAliases())
  vi.stubGlobal('getInstalledLanguages', async () => [{ drupalInternalId: 'en' }, { drupalInternalId: 'fr' }])
  vi.stubGlobal('mapLocaleFromDrupal', mapLocaleFromDrupal)
  vi.stubGlobal('createError', (e) => Object.assign(new Error(e.message), e))
  ;({ mapAliasByLocale } = await import('~/server/utils/drupal/drupal-path-alias.js'))
})

afterEach(() => vi.unstubAllGlobals())

describe('mapAliasByLocale home detection', () => {
  it.each([
    ['no homePath', undefined],
    ['an empty homePath', ''],
  ])('treats term 20 as an ordinary term with %s', async (_label, homePath) => {
    await expect(mapAliasByLocale({ ...ctx, homePath }, 'taxonomy/term', 20))
      .resolves.toEqual({ en: '/en/taxonomy/term/20', fr: '/fr/taxonomy/term/20' })
  })

  it.each([
    ['a term home', '/taxonomy/term/20', 'taxonomy/term', 20],
    ['a node home', '/node/1000', 'node', 1000],
  ])('maps %s to the locale roots', async (_label, homePath, type, id) => {
    await expect(mapAliasByLocale({ ...ctx, homePath }, type, id)).resolves.toEqual({ en: '/en', fr: '/fr' })
  })
})
