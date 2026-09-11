import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { ref, unref } from 'vue'

// Plain Node Vitest does not supply Nuxt's top-level auto-imports.
vi.hoisted(() => {
  vi.stubGlobal('defineNuxtPlugin', (plugin) => plugin)
})

import clientPlugin, { isKnownDevHost, resolveClientSiteIdentifier } from '../../../../app/plugins/site.js'

afterAll(() => vi.unstubAllGlobals())

describe('isKnownDevHost', () => {
  it.each([
    ['localhost', undefined, true],
    ['127.0.0.1', undefined, true],
    ['be.localhost', undefined, true],
    ['e2e.localhost', undefined, true],
    ['be.chm-cbd.net', 'chm-cbd.net', true],
    ['be.attacker.example', 'chm-cbd.net', false],
    ['evil.example.org', undefined, false],
    ['be.chm-cbd.net.attacker.example', 'chm-cbd.net', false],
    ['be.notchm-cbd.net', 'chm-cbd.net', false],
    ['chm-cbd.net', 'chm-cbd.net', false],
    ['be.chm-cbd.net', undefined, false],
    ['', 'chm-cbd.net', false],
    [undefined, 'chm-cbd.net', false],
  ])('classifies %s with baseHost %s as %s', (host, baseHost, expected) => {
    expect(isKnownDevHost(host, baseHost)).toBe(expected)
  })
})

describe('resolveClientSiteIdentifier', () => {
  it.each([
    [{ stateSiteCode: 'state-site', cookieSiteCode: 'cookie-site', hostName: 'be.chm-cbd.net', baseHost: 'chm-cbd.net' }, 'state-site'],
    [{ stateSiteCode: 'state-site' }, 'state-site'],
    // The verified host outranks the client-writable cookie on every multi-label host.
    [{ stateSiteCode: null, cookieSiteCode: 'cookie-site', hostName: 'be.chm-cbd.net', baseHost: 'chm-cbd.net' }, 'be'],
    [{ cookieSiteCode: 'attacker-tenant', hostName: 'be.chm-cbd.net', baseHost: 'chm-cbd.net' }, 'be'],
    [{ cookieSiteCode: 'attacker-tenant', hostName: 'be.localhost' }, 'be'],
    // Plain `localhost` yields no host label, so the cookie still supplies the siteCode.
    [{ cookieSiteCode: 'cookie-site', hostName: 'localhost' }, 'cookie-site'],
    [{ cookieSiteCode: 'cookie-site' }, 'cookie-site'],
    [{ stateSiteCode: '', cookieSiteCode: '', hostName: 'be.localhost' }, 'be'],
    [{ hostName: 'e2e.localhost' }, 'e2e'],
    // No cookie on a single-label host: null, which restores the pre-task 404.
    [{ hostName: 'localhost' }, null],
    [{ hostName: '127.0.0.1' }, '127'],
    [{ hostName: 'be.chm-cbd.net', baseHost: 'chm-cbd.net' }, 'be'],
    [{ hostName: 'be.attacker.example', baseHost: 'chm-cbd.net' }, null],
    [{ hostName: 'evil.example.org', baseHost: 'chm-cbd.net' }, null],
    [{ hostName: '' }, null],
    [{}, null],
  ])('resolves %j to %s', (params, expected) => {
    expect(resolveClientSiteIdentifier(params)).toBe(expected)
  })
})

describe('site plugin setup', () => {
  let vite
  let serverPlugin
  let states
  let cookie
  let requestEvent
  let requestUrl
  let siteStore
  let fetchContext
  let nuxtApp
  let useStateMock
  let useRequestEventMock

  beforeAll(async () => {
    // Compile the real module with Nuxt's SSR flag, without starting Nuxt,
    // loading dotenv/config, or copying any production function into this test.
    vite = await createServer({
      root: fileURLToPath(new URL('../../../..', import.meta.url)),
      configFile: false,
      envFile: false,
      logLevel: 'silent',
      define: { 'import.meta.server': 'true', 'import.meta.client': 'false' },
      server: { middlewareMode: true, hmr: false, watch: null },
    })
    serverPlugin = (await vite.ssrLoadModule('/app/plugins/site.js')).default
  })

  afterAll(async () => { await vite?.close() })
  afterEach(() => vi.unstubAllGlobals())

  beforeEach(() => {
    states = new Map()
    cookie = ref({ siteCode: 'cookie-site' })
    requestEvent = { context: { site: { siteCode: 'server-site' } } }
    requestUrl = { hostname: 'be.localhost', pathname: '/en' }
    siteStore = {
      params: {},
      initialize: vi.fn((data) => { siteStore.params = data; siteStore.locale = data.locale }),
      set: vi.fn((key, value) => { siteStore[key] = value; siteStore.params[key] = value }),
    }
    // Only the external context API is stubbed; plugin setup and resolver run.
    fetchContext = vi.fn(async (uri) => ({
      siteCode: uri.split('/')[3],
      host: 'fixture.example.test',
      locale: 'en',
      defaultLocale: 'en',
      locales: ['en'],
      config: { locales: ['en'] },
    }))
    nuxtApp = { vueApp: { use: vi.fn() }, $pinia: {}, hook: vi.fn() }
    useStateMock = vi.fn((key, init) => {
      if (!states.has(key)) states.set(key, ref(init()))
      return states.get(key)
    })
    useRequestEventMock = vi.fn(() => requestEvent)
    const globals = {
      useState: useStateMock,
      useRequestEvent: useRequestEventMock,
      useCookie: vi.fn(() => cookie),
      useRequestURL: () => requestUrl,
      useRuntimeConfig: () => ({ public: { baseHost: 'chm-cbd.net', locales: [{ code: 'en' }] } }),
      useI18n: () => ({ locale: ref('en'), setLocale: vi.fn() }),
      useSiteStore: () => siteStore,
      useHead: vi.fn(),
      createError: (options) => Object.assign(new Error(options.statusMessage), options),
      $fetch: fetchContext,
      ref,
      unref,
    }
    for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value)
  })

  it('bridges the request-event siteCode into the exact shared state key before fetching context', async () => {
    // A pre-existing value must not prevent SSR from using this request's Site.
    states.set('siteCode', ref('previous-site'))

    await serverPlugin.setup(nuxtApp)

    expect(useRequestEventMock).toHaveBeenCalledOnce()
    expect(useStateMock).toHaveBeenCalledWith('siteCode', expect.any(Function))
    expect(useStateMock.mock.calls[0][1]()).toBeUndefined()
    expect([...states.keys()]).toEqual(['siteCode'])
    expect(states.get('siteCode').value).toBe('server-site')
    expect(fetchContext).toHaveBeenCalledWith('/api/context/server-site/en')
    expect(siteStore.params.siteCode).toBe('server-site')
  })

  it('reuses server state on the client without reading a request event', async () => {
    await serverPlugin.setup(nuxtApp)
    cookie.value = { siteCode: 'stale-cookie' }
    nuxtApp.ssrContext = { event: { context: { site: { siteCode: 'wrong-site' } } } }
    requestEvent.context.site.siteCode = 'wrong-event'
    useRequestEventMock.mockClear()
    fetchContext.mockClear()

    await clientPlugin.setup(nuxtApp)

    expect(useRequestEventMock).not.toHaveBeenCalled()
    expect(states.get('siteCode').value).toBe('server-site')
    expect(fetchContext).toHaveBeenCalledWith('/api/context/server-site/en')
  })

  it.each([undefined, {}, { context: {} }, { context: { site: {} } }])('leaves state unset without a resolved SSR Site (%j)', async (event) => {
    requestEvent = event

    await serverPlugin.setup(nuxtApp)

    expect(states.get('siteCode').value).toBeUndefined()
    // State unset, so the verified host (be.localhost) resolves the tenant, not the cookie.
    expect(fetchContext).toHaveBeenCalledWith('/api/context/be/en')
  })

  it.each([
    ['state-site', 'cookie-site', undefined, 'state-site'],
    [undefined, 'cookie-site', undefined, 'cookie-site'],
    [undefined, 'cookie-site', 'localhost', 'cookie-site'],
    [undefined, 'cookie-site', 'custom.example.test', 'cookie-site'],
    [undefined, undefined, 'e2e.localhost', 'e2e'],
    [undefined, undefined, 'be.chm-cbd.net', 'be'],
    // A conflicting cookie cannot re-tenant a verified production host.
    [undefined, 'other-tenant', 'be.chm-cbd.net', 'be'],
  ])('client resolves state=%s cookie=%s host=%s before fetching %s', async (state, cookieCode, host, expected) => {
    if (state) states.set('siteCode', ref(state))
    cookie.value = cookieCode ? { siteCode: cookieCode } : undefined
    requestUrl.hostname = host

    await clientPlugin.setup(nuxtApp)

    expect(fetchContext).toHaveBeenCalledWith(`/api/context/${expected}/en`)
    expect(siteStore.params.siteCode).toBe(expected)
    expect(cookie.value.siteCode).toBe(expected)
    expect(useRequestEventMock).not.toHaveBeenCalled()
  })

  it.each([
    [undefined, 'Not Found Plugins.site.getBiolandSiteIdentifier: no host derived to find env site context.'],
    ['be.attacker.example', 'Not Found Plugins.site.getBiolandSiteIdentifier: no siteKey derived to find env site context.'],
    // Plain localhost without a cookie keeps the pre-task 404 and issues no network call.
    ['localhost', 'Not Found Plugins.site.getBiolandSiteIdentifier: no siteKey derived to find env site context.'],
  ])('preserves the original 404 when no Site can be resolved for %s', async (host, statusMessage) => {
    cookie.value = undefined
    requestUrl.hostname = host

    await expect(clientPlugin.setup(nuxtApp)).rejects.toMatchObject({ statusCode: 404, statusMessage })

    expect(fetchContext).not.toHaveBeenCalled()
    expect(siteStore.initialize).not.toHaveBeenCalled()
  })
})
