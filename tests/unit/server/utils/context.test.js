import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getRequestHost, getRequestHeader, getQuery, parseCookies, createError } from 'h3'
import { CACHE_TTL } from '../../../../shared/utils/constants'
import { getSiteSettings } from '../../../../server/utils/drupal/index.js'
import * as siteHost from '~/shared/utils/site-host'

vi.mock('../../../../server/utils/drupal/index.js', () => ({ getSiteSettings: vi.fn() }))

const eventFor = (headers = {}, path = '/en/page') => ({ path, context: {}, node: { req: { headers } } })
const cookieFor = (value) => `context=${encodeURIComponent(JSON.stringify(value))}`
let contextModule, runtime, config

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  runtime = { baseHost: 'test.example.com', env: 'dev', multiSiteCode: 'bl2',
    locales: [{ code: 'en' }, { code: 'es' }, { code: 'fr' }], dmsm: 'https://dmsm.example.test' }
  config = { locales: ['en', 'es', 'fr'], defaultLocale: 'en', country: 'BE' }
  vi.stubGlobal('useRuntimeConfig', () => ({ public: runtime }))
  vi.stubGlobal('getRequestHeader', getRequestHeader)
  vi.stubGlobal('getRequestHost', vi.fn(getRequestHost))
  vi.stubGlobal('getQuery', vi.fn(getQuery))
  vi.stubGlobal('parseCookies', vi.fn(parseCookies))
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  // Per-Site config is an external fixture here; the index suite uses real Nitro caching.
  vi.stubGlobal('cachedFunction', (fn, options) => (...args) => { options.getKey(...args); return fn(...args) })
  vi.stubGlobal('$fetch', vi.fn(async () => config))
  vi.stubGlobal('consola', { error: vi.fn(), debug: vi.fn(), warn: vi.fn() })
  vi.stubGlobal('resolveSiteCodeByHost', vi.fn(async () => null))
  // #81 moved redirect gating into shared site-host helpers called as Nitro
  // auto-imports; stub them with the real implementations under plain vitest.
  vi.stubGlobal('getCanonicalHost', siteHost.getCanonicalHost)
  vi.stubGlobal('normalizeRedirectHost', siteHost.normalizeRedirectHost)
  getSiteSettings.mockResolvedValue({ siteName: 'Fixture Site', homePath: '/home' })
  contextModule = await import('../../../../server/utils/context-unified')
})

afterEach(() => vi.unstubAllGlobals())

describe('Context Utilities', () => {
  describe('extractSiteCodeFromHost', () => {
    it.each([
      ['be.localhost', 'be'], ['be.test.example.com', 'be'], ['be.attacker.example', 'be'],
      ['', null], ['localhost', null], ['127.0.0.1', null], ['::1', null],
      ['[::1]:3330', null], ['single-label', null],
    ])('retains the extraction helper contract for %s', (host, expected) => {
      expect(contextModule.extractSiteCodeFromHost(host)).toBe(expected)
    })
  })

  describe('known-host baseline characterization', () => {
    it.each([
      [{ host: 'be.localhost:3330' }, 'be'],
      [{ host: 'be.test.example.com' }, 'be'],
      [{ host: 'fr.localhost', 'x-forwarded-host': 'be.localhost:443, proxy.example' }, 'be'],
      [{ host: 'be.localhost', 'x-forwarded-host': '' }, 'be'],
      [{ host: 'fr.localhost', 'x-forwarded-host': ['', 'be.localhost'] }, 'be'],
      [{ host: 'be.localhost', 'x-forwarded-host': ['be.localhost', 'fr.localhost'] }, 'be'],
      [{ host: 'localhost' }, 'query-site'], [{ host: '127.0.0.1:80' }, 'query-site'],
      [{ host: '::1' }, 'query-site'], [{ host: '[::1]:3330' }, 'query-site'],
      [{ host: '[::]' }, 'query-site'], [{}, 'query-site'], [{ host: '' }, 'query-site'],
    ])('preserves raw header precedence and query fallback: %j', async (headers, siteCode) => {
      const event = eventFor(headers, '/en/page?siteCode=query-site')
      const context = await contextModule.useRequestContext(event)
      expect(context.siteCode).toBe(siteCode)
      expect(event.context.site).toBe(context)
      expect(resolveSiteCodeByHost).not.toHaveBeenCalled()
    })

    it.each(['localhost', '127.0.0.1', '::1', '[::1]:3330', ''])('retains cookie fallback on %s', async (host) => {
      const event = eventFor({ host, cookie: cookieFor({ siteCode: 'cookie-site', locale: 'fr' }) })
      expect((await contextModule.useRequestContext(event)).siteCode).toBe('cookie-site')
    })

    it('fails closed on the preserved raw path even though h3 would have fallen back', async () => {
      const event = eventFor({ host: 'be.localhost', 'x-forwarded-host': ', proxy.example' }, '/?siteCode=query-site')
      expect(getRequestHost(event, { xForwardedHost: true })).toBe('be.localhost')
      await expect(contextModule.useRequestContext(event)).rejects.toMatchObject({ statusCode: 400 })
      expect(globalThis.getQuery).not.toHaveBeenCalled()
    })

    // Every supplied Host that normalizes to nothing must 400 before the query/cookie
    // fallback; a request with NO Host bytes at all keeps that internal fallback.
    it.each([', proxy.example', ',', '  ', ':8080'])('fails closed on unresolvable x-forwarded-host %j', async (forwarded) => {
      const headers = { host: 'be.localhost', 'x-forwarded-host': forwarded,
        cookie: cookieFor({ siteCode: 'cookie-site' }) }
      const event = eventFor(headers, '/en/page?siteCode=be')
      await expect(contextModule.useRequestContext(event)).rejects.toMatchObject({
        statusCode: 400, statusMessage: 'Bad Request', message: 'Unresolvable Host header',
      })
      expect(resolveSiteCodeByHost).not.toHaveBeenCalled()
      expect(globalThis.getQuery).not.toHaveBeenCalled()
      expect(globalThis.parseCookies).not.toHaveBeenCalled()
      expect(consola.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'Host failed closed', host: forwarded }))
    })

    it('routes a non-loopback IPv6 literal through the index and fails closed', async () => {
      const event = eventFor({ host: 'be.localhost', 'x-forwarded-host': '[2001:db8::1]',
        cookie: cookieFor({ siteCode: 'cookie-site' }) }, '/en/page?siteCode=be')
      await expect(contextModule.useRequestContext(event)).rejects.toMatchObject({
        statusCode: 400, message: 'No Site configured for host: [2001:db8::1]',
      })
      expect(resolveSiteCodeByHost).toHaveBeenCalledWith('[2001:db8::1]')
      expect(globalThis.getQuery).not.toHaveBeenCalled()
      expect(globalThis.parseCookies).not.toHaveBeenCalled()
    })

    it.each(['localhost', 'localhost:3000', 'LOCALHOST:80', '127.0.0.1', '127.0.0.1:8080', '::1', '[::1]', '[::1]:3330', '[::]'])('keeps loopback %s on the query fallback', async (host) => {
      const event = eventFor({ host }, '/en/page?siteCode=query-site')
      expect((await contextModule.useRequestContext(event)).siteCode).toBe('query-site')
      expect(resolveSiteCodeByHost).not.toHaveBeenCalled()
      expect(consola.warn).not.toHaveBeenCalled()
    })

    // Codex P1 (PR 83, comment 3991770985): '::1:80' port-strips to '::1' and must
    // not masquerade as the loopback. Only the exact raw internal spellings keep
    // the query/cookie fallback; every other form reaches the index and fails
    // closed unmapped, before either fallback can name its own tenant.
    it.each(['::1:80', '::1:443', '::1:80:90'])('routes the malformed bare IPv6 Host %s through the index and fails closed', async (rawHost) => {
      const event = eventFor({ host: rawHost, cookie: cookieFor({ siteCode: 'cookie-site' }) }, '/en/page?siteCode=query-site')
      await expect(contextModule.useRequestContext(event)).rejects.toMatchObject({
        statusCode: 400, statusMessage: 'Bad Request', message: expect.stringContaining('No Site configured for host'),
      })
      expect(resolveSiteCodeByHost).toHaveBeenCalled()
      expect(globalThis.getQuery).not.toHaveBeenCalled()
      expect(globalThis.parseCookies).not.toHaveBeenCalled()
      expect(consola.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'Host failed closed', path: '/en/page' }))
    })

    it('routes a port-suffixed forwarded ::1:80 through the index and fails closed', async () => {
      const event = eventFor({ host: 'be.localhost', 'x-forwarded-host': '::1:80', cookie: cookieFor({ siteCode: 'cookie-site' }) }, '/en/page?siteCode=query-site')
      await expect(contextModule.useRequestContext(event)).rejects.toMatchObject({
        statusCode: 400, statusMessage: 'Bad Request', message: expect.stringContaining('No Site configured for host'),
      })
      expect(resolveSiteCodeByHost).toHaveBeenCalled()
      expect(globalThis.getQuery).not.toHaveBeenCalled()
      expect(globalThis.parseCookies).not.toHaveBeenCalled()
    })

    it.each(['.localhost', '.test.example.com'])('fails closed on the leading-empty-label host %s before either fallback', async (host) => {
      const event = eventFor({ host, cookie: cookieFor({ siteCode: 'cookie-site' }) }, '/en/page?siteCode=query-site')
      await expect(contextModule.useRequestContext(event)).rejects.toMatchObject({
        statusCode: 400, statusMessage: 'Bad Request', message: `No Site configured for host: ${host}`,
      })
      expect(resolveSiteCodeByHost).not.toHaveBeenCalled()
      expect(globalThis.getQuery).not.toHaveBeenCalled()
      expect(globalThis.parseCookies).not.toHaveBeenCalled()
      expect(consola.warn).toHaveBeenCalledWith({ message: 'Host failed closed', host, path: '/en/page' })
    })

    it.each([{}, { host: '' }, { host: 'localhost' }, { host: '::1' }])('fails only after both fallbacks miss: %j', async (headers) => {
      await expect(contextModule.useRequestContext(eventFor(headers))).rejects.toMatchObject({ statusCode: 400 })
      expect(globalThis.getQuery).toHaveBeenCalled()
      expect(globalThis.parseCookies).toHaveBeenCalled()
    })

    it('keeps explicit siteCode and event-context shortcuts on custom hosts', async () => {
      const event = eventFor({ host: 'be.attacker.example' })
      event.context.site = { siteCode: 'cached-site' }
      expect(await contextModule.useRequestContext(event)).toBe(event.context.site)
      expect((await contextModule.useRequestContext(event, { siteCode: 'explicit-site', locale: 'fr' })).siteCode).toBe('explicit-site')
      expect(event.context.site.siteCode).toBe('cached-site')
      expect(resolveSiteCodeByHost).not.toHaveBeenCalled()
      expect(globalThis.getRequestHost).not.toHaveBeenCalled()
    })
  })

  describe('inbound redirect Host classification', () => {
    it.each([
      ['be.attacker.example', '/en/page', undefined],
      ['be.attacker.example', '/en/page?siteCode=be', undefined],
      ['be.attacker.example', '/en/page', { siteCode: 'be', locale: 'fr' }],
      ['collision.example', '/en/page?siteCode=be', { siteCode: 'be' }],
      [':', '/en/page?siteCode=be', { siteCode: 'be' }],
      ['test.example.com', '/en/page?siteCode=be', undefined],
      ['be.test.example.com.attacker.example', '/en/page?siteCode=be', undefined],
      // Trailing bytes after the closing bracket must not ride the loopback allowlist:
      // extractSiteCodeFromHost returns null for anything bracketed, so a prefix-only
      // match would drop these on the query/cookie fallback to pick their own tenant.
      ['[::1]evil', '/en/page?siteCode=be', { siteCode: 'be' }],
      ['[::]x', '/en/page?siteCode=be', { siteCode: 'be' }],
    ])('rejects unmapped %s before either fallback', async (host, path, cookie) => {
      const headers = { host, ...(cookie ? { cookie: cookieFor(cookie) } : {}) }
      await expect(contextModule.useRequestContext(eventFor(headers, path))).rejects.toMatchObject({
        statusCode: 400, statusMessage: 'Bad Request', message: `No Site configured for host: ${host}`,
      })
      expect(resolveSiteCodeByHost).toHaveBeenCalledWith(host)
      expect(globalThis.getQuery).not.toHaveBeenCalled()
      expect(globalThis.parseCookies).not.toHaveBeenCalled()
      expect($fetch).not.toHaveBeenCalled()
      expect(consola.warn).toHaveBeenCalledWith({ message: 'Host failed closed', host, path: '/en/page' })
    })

    it('uses the mapped Site over conflicting first-label, query and cookie values', async () => {
      resolveSiteCodeByHost.mockResolvedValue('mapped-site')
      const event = eventFor({ host: 'fr.localhost', 'x-forwarded-host': 'Chm.Example.Gov:443, proxy.example',
        cookie: cookieFor({ siteCode: 'cookie-site' }) }, '/?siteCode=query-site')
      expect((await contextModule.useRequestContext(event)).siteCode).toBe('mapped-site')
      expect(resolveSiteCodeByHost).toHaveBeenCalledWith('chm.example.gov')
      expect(globalThis.getRequestHost).toHaveBeenCalledWith(event, { xForwardedHost: true })
    })

    it.each(['BE.Localhost:3330', 'BE.TEST.EXAMPLE.COM:443'])('case-folds the known host %s without consulting the index', async (host) => {
      expect((await contextModule.useRequestContext(eventFor({ host }))).siteCode).toBe('be')
      expect(resolveSiteCodeByHost).not.toHaveBeenCalled()
    })
  })

  describe('extractLocaleFromPath', () => {
    it.each([['/es/page', 'es'], ['/unsupported/page', 'en'], ['/', 'en'], ['', 'en']])('resolves locale from %s through real context', async (path, locale) => {
      expect((await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }, path))).locale).toBe(locale)
    })
  })

  describe('resolveLocale', () => {
    it.each([
      ['/es/page?locale=fr', 'en', undefined, 'fr'],
      ['/es/page', 'fr', undefined, 'es'],
      ['/page', 'fr', undefined, 'fr'],
      ['/page', 'xx', undefined, 'en'],
      ['/page', undefined, undefined, 'en'],
      ['/es/page?locale=xx', 'fr', 'und', 'es'],
      ['/es/page', 'en', 'fr', 'fr'],
      ['/es/page', 'en', 'xx', 'es'],
    ])('retains explicit/query/path/cookie/default priority for %s', async (path, cookieLocale, explicitLocale, expected) => {
      const event = eventFor({ host: 'be.localhost', cookie: cookieFor({ locale: cookieLocale }) }, path)
      expect((await contextModule.useRequestContext(event, { locale: explicitLocale })).locale).toBe(expected)
    })

    it('ignores malformed context cookies', async () => {
      const event = eventFor({ host: 'be.localhost', cookie: 'context=not-json' }, '/page')
      expect((await contextModule.useRequestContext(event)).locale).toBe('en')
      expect(contextModule.getCookieSiteCode(event)).toBeNull()
      expect(contextModule.getCookieSiteCode(eventFor({ cookie: cookieFor({ locale: 'fr' }) }))).toBeNull()
    })

    it('keeps English/default locale when the site list or runtime locales are absent', async () => {
      config.locales = undefined
      config.defaultLocale = 'fr'
      runtime.locales = undefined
      expect(await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }, '/xx'))).toMatchObject({ locales: ['en', 'fr'], locale: 'fr' })
    })

    it('does not use a runtime path locale unless the Site serves it', async () => {
      config.locales = ['en']
      config.defaultLocale = ''
      expect((await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }, '/fr'))).locale).toBe('')
    })
  })

  describe('normalizeCountries', () => {
    it.each([
      ['BE', undefined, ['BE']], [undefined, ['FR'], ['FR']], ['BE', ['BE', 'FR'], ['BE', 'FR']],
      ['BE', ['undefined', '', 'FR'], ['BE', 'FR']], [undefined, undefined, []],
    ])('normalizes country %s and countries %j', async (country, countries, expected) => {
      Object.assign(config, { country, countries })
      expect((await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }))).countries).toEqual(expected)
    })
  })

  describe('buildSiteContext', () => {
    it('builds the full context with settings and normalized runtime data', async () => {
      config.runTime = { biolandSettings: { show_home: true } }
      expect(await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }))).toMatchObject({
        siteCode: 'be', identifier: 'be', env: 'dev', multiSiteCode: 'bl2', locale: 'en',
        host: 'https://be.test.example.com', localizedHost: 'https://be.test.example.com/en',
        indexLocale: 'EN', countries: ['BE'], siteName: 'Fixture Site', homePath: '/home', biolandSettings: { showHome: true },
      })
    })

    it.each(['bch.example', 'biosafety.example', 'bsl.example'])('detects BCH Sites using %s', async (baseHost) => {
      runtime.baseHost = baseHost
      expect((await contextModule.useRequestContext(eventFor({ host: `be.${baseHost}` }))).isBchSite).toBe(true)
    })

    it.each([['prod', 'https://be.test.example.com'], ['production', 'https://redirect.example']])('preserves the literal production redirect gate in %s', async (env, host) => {
      runtime.env = env
      config.redirect = 'redirect.example'
      expect((await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }))).host).toBe(host)
    })

    // #81 contract: redirect gating lives in the shared site-host helper and a
    // rejected DMSM redirect warns once. Adapted to the mocked-drupal harness:
    // settings come from the getSiteSettings mock, so the second fetch the
    // upstream test asserted on is gone.
    it('should handle redirect in production', async () => {
      const canonicalHost = vi.spyOn(siteHost, 'getCanonicalHost')
      const error = vi.fn()
      const warn = vi.fn()
      vi.stubGlobal('getCanonicalHost', canonicalHost)
      vi.stubGlobal('normalizeRedirectHost', siteHost.normalizeRedirectHost)
      vi.stubGlobal('consola', { debug: vi.fn(), error, warn })

      try {
        for (const [env, redirect, host] of [
          ['production', 'custom.example.test', 'https://custom.example.test'],
          ['production', '', 'https://seed.example.test'],
          ['production', undefined, 'https://seed.example.test'],
          ['dev', 'custom.example.test', 'https://seed.example.test'],
          ['stg', 'custom.example.test', 'https://seed.example.test'],
          ['prod', 'custom.example.test', 'https://seed.example.test'],
          ['production', '169.254.169.254', 'https://seed.example.test'],
        ]) {
          config = { redirect, defaultLocale: 'fr', locales: ['fr'] }
          vi.stubGlobal('useRuntimeConfig', () => ({
            public: { env, baseHost: 'example.test', multiSiteCode: 'test', dmsm: 'https://dmsm.example.test', locales: [{ code: 'fr' }] },
          }))
          canonicalHost.mockClear()
          const event = eventFor({}, '/fr')

          const context = await contextModule.useRequestContext(event, { siteCode: 'seed', locale: 'fr', bypassCache: true })

          expect(canonicalHost).toHaveBeenCalledExactlyOnceWith({ siteCode: 'seed', baseHost: 'example.test', env, redirect })
          expect(context).toMatchObject({ host, localizedHost: `${host}/fr`, redirect, siteName: 'Fixture Site', homePath: '/home' })
          expect(error).not.toHaveBeenCalled()
        }

        // Only the rejected metadata-endpoint redirect warns, and it warns once.
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          'Ignoring unusable DMSM redirect for site seed: "169.254.169.254"',
        )
      } finally {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
      }
    })

    it.each([['fr', 'FR'], ['nl', 'EN']])('uses index locale for %s', async (locale, indexLocale) => {
      config.locales.push(locale)
      expect((await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }, `/${locale}`))).indexLocale).toBe(indexLocale)
    })

    it('retains noncritical settings-fetch failure behavior', async () => {
      getSiteSettings.mockRejectedValue(new Error('Fixture settings unavailable'))
      expect(await contextModule.useRequestContext(eventFor({ host: 'be.localhost' }))).toMatchObject({ siteCode: 'be', siteName: undefined, homePath: undefined })
      expect(consola.error).toHaveBeenCalled()
    })
  })

  describe('per-Site config baseline', () => {
    it.each([null, new Error('Fixture DMSM unavailable')])('retains 404 for unavailable per-Site config', async (result) => {
      if (result instanceof Error) $fetch.mockRejectedValue(result)
      else $fetch.mockResolvedValue(result)
      await expect(contextModule.useRequestContext(eventFor({ host: 'be.localhost' }))).rejects.toMatchObject({ statusCode: 404 })
    })

    it('keeps explicit options and bypassCache working', async () => {
      expect((await contextModule.useRequestContext(eventFor({ host: 'unmapped.example' }), { siteCode: 'be', bypassCache: true })).siteCode).toBe('be')
      expect(consola.debug).toHaveBeenCalled()
      expect(resolveSiteCodeByHost).not.toHaveBeenCalled()
    })

    it('coalesces simultaneous per-Site config lookups', async () => {
      const contexts = await Promise.all([1, 2].map(() => contextModule.useRequestContext(eventFor({ host: 'be.localhost' }))))
      expect(contexts.map(context => context.siteCode)).toEqual(['be', 'be'])
      expect($fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getCountryCode', () => {
    it('returns country if present', () => {
      expect(contextModule.getCountryCode({ country: 'BE' })).toBe('BE')
    })

    it('returns the deterministic selected country from the array', () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.75)
      try { expect(contextModule.getCountryCode({ countries: ['BE', 'FR'] })).toBe('FR') }
      finally { random.mockRestore() }
    })

    it.each([{}, { countries: [] }])('throws if no country is configured: %j', (context) => {
      expect(() => contextModule.getCountryCode(context)).toThrow('No country or countries provided by context')
    })
  })
})
