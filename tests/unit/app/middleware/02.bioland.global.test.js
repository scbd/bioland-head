import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubGlobal('defineNuxtRouteMiddleware', (handler) => handler)
})

import middleware from '../../../../app/middleware/02.bioland.global.js'

afterAll(() => vi.unstubAllGlobals())

describe('middleware site identifier resolution', () => {
  let siteStore
  let fetchContext
  let runtimeConfig
  let hostName
  let contextCookie
  let errorLog

  beforeEach(() => {
    hostName = 'be.chm-cbd.net'
    runtimeConfig = { public: { baseHost: 'chm-cbd.net', locales: [{ code: 'en' }] } }
    contextCookie = { value: null }
    siteStore = {
      siteCode: null,
      locale: null,
      defaultLocale: null,
      initialize: vi.fn((data) => Object.assign(siteStore, data)),
      get params() {
        return { siteCode: this.siteCode, locale: this.locale, defaultLocale: this.defaultLocale }
      },
    }
    fetchContext = vi.fn(async (uri) => ({
      siteCode: uri.split('/')[3],
      locale: 'en',
      defaultLocale: 'en',
      config: {},
      locales: ['en'],
      siteName: 'Fixture Site',
      homePath: '/en',
    }))
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const globals = {
      useNuxtApp: () => ({ $pinia: {}, $i18n: { locale: { value: 'en' } } }),
      useSiteStore: () => siteStore,
      usePageStore: () => ({ initialize: vi.fn() }),
      useMenusStore: () => ({ isLoaded: true, loadAllMenus: vi.fn() }),
      useMeStore: () => ({ initialize: vi.fn() }),
      useGetPage: () => vi.fn(async () => null),
      useFetch: vi.fn(async () => ({ data: { value: null }, error: { value: null } })),
      useRuntimeConfig: () => runtimeConfig,
      useRequestURL: () => ({ hostname: hostName }),
      useRequestHeaders: () => ({}),
      hasSessionCookieClient: () => 'fixture-session',
      useCookie: (name) => name === 'context' ? contextCookie : { value: null },
      $fetch: fetchContext,
      navigateTo: vi.fn(),
      reloadNuxtApp: vi.fn(),
      createError: (options) => Object.assign(new Error(options.statusMessage), options),
    }
    for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    'unknown.example.org',
    'be.attacker.example',
    'be.chm-cbd.net.attacker.example',
    'be.notchm-cbd.net',
    'chm-cbd.net',
    '',
    undefined,
    'localhost',
  ])('skips derived site identifier for unknown or non-subdomain host %s', async (host) => {
    hostName = host

    await middleware({ path: '/en' }, {})

    expect(fetchContext).not.toHaveBeenCalled()
    expect(siteStore.initialize).not.toHaveBeenCalled()
    expect(contextCookie.value).toBeNull()
    expect(errorLog).toHaveBeenCalledWith('[middleware] Cannot derive siteCode from hostname:', host)
  })

  it.each([
    ['be.chm-cbd.net', 'be'],
    ['be.localhost', 'be'],
    ['e2e.localhost', 'e2e'],
    ['127.0.0.1', '127'],
  ])('derives site identifier from known host %s when fallback path needed', async (host, siteCode) => {
    hostName = host

    await middleware({ path: '/en' }, {})

    expect(fetchContext).toHaveBeenCalledExactlyOnceWith(`/api/context/${siteCode}/en`)
    expect(siteStore.initialize).toHaveBeenCalledWith(expect.objectContaining({ siteCode, locale: 'en', defaultLocale: 'en' }))
    expect(siteStore.siteCode).toBe(siteCode)
    expect(contextCookie.value).toEqual({ siteCode, locale: 'en', defaultLocale: 'en', locales: ['en'] })
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('reads the configured baseHost inside the fallback helper', async () => {
    runtimeConfig.public.baseHost = 'fixture.example.test'
    hostName = 'seed.fixture.example.test'

    await middleware({ path: '/en' }, {})

    expect(fetchContext).toHaveBeenCalledWith('/api/context/seed/en')
    expect(siteStore.siteCode).toBe('seed')
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('does not infer a custom host when no baseHost is configured', async () => {
    delete runtimeConfig.public.baseHost

    await middleware({ path: '/en' }, {})

    expect(fetchContext).not.toHaveBeenCalled()
    expect(siteStore.initialize).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalledWith('[middleware] Cannot derive siteCode from hostname:', hostName)
  })

  it('keeps an initialized Site on a custom host instead of invoking fallback', async () => {
    Object.assign(siteStore, { siteCode: 'server-site', locale: 'en', defaultLocale: 'en' })
    hostName = 'custom.example.test'

    await middleware({ path: '/en' }, {})

    expect(fetchContext).not.toHaveBeenCalled()
    expect(siteStore.initialize).not.toHaveBeenCalled()
    expect(siteStore.siteCode).toBe('server-site')
    expect(errorLog).not.toHaveBeenCalled()
  })
})
