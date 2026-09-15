import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getRequestHost, getRequestHeader, getQuery, parseCookies, createError } from 'h3'
import { CACHE_TTL } from '../../../../shared/utils/constants'
import * as siteHost from '~/shared/utils/site-host'

// BL-967 p01-04: both DMSM config cache keys (the `cachedFunction` persistent-cache key
// and the in-flight-request coalescing key) must distinguish `env` so `dev`/`stg`/`prod`
// never collide on a shared Nitro FS cache volume or thundering-herd dedupe map.

vi.mock('../../../../server/utils/drupal/index.js', () => ({ getSiteSettings: vi.fn() }))

const eventFor = () => ({ path: '/en/page', context: {}, node: { req: { headers: {} } } })

let contextModule: typeof import('../../../../server/utils/context-unified')
let runtime: Record<string, unknown>
let capturedCachedFunctionKeys: string[]
let fetchCallCount: number
let pendingResolvers: Array<(value: unknown) => void>

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()

  runtime = {
    baseHost: 'test.example.com',
    env: 'dev',
    multiSiteCode: 'bl2',
    locales: [{ code: 'en' }],
    dmsm: 'https://dmsm.example.test',
  }
  capturedCachedFunctionKeys = []
  fetchCallCount = 0
  pendingResolvers = []

  vi.stubGlobal('useRuntimeConfig', () => ({ public: runtime }))
  vi.stubGlobal('getRequestHeader', getRequestHeader)
  vi.stubGlobal('getRequestHost', vi.fn(getRequestHost))
  vi.stubGlobal('getQuery', vi.fn(getQuery))
  vi.stubGlobal('parseCookies', vi.fn(parseCookies))
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('consola', { error: vi.fn(), debug: vi.fn(), warn: vi.fn() })
  vi.stubGlobal('resolveSiteCodeByHost', vi.fn(async () => null))
  vi.stubGlobal('getCanonicalHost', siteHost.getCanonicalHost)
  vi.stubGlobal('normalizeRedirectHost', siteHost.normalizeRedirectHost)

  // Record the key `_fetchDmsmConfig` computes via its `getKey` option, without
  // performing any real caching - each call still invokes `fn` directly.
  vi.stubGlobal('cachedFunction', (fn: (...args: unknown[]) => unknown, options: { getKey: (...args: unknown[]) => string }) =>
    (...args: unknown[]) => {
      capturedCachedFunctionKeys.push(options.getKey(...args))
      return fn(...args)
    })

  // Never auto-resolves - lets a test hold two requests in-flight at once to prove
  // (or disprove) that the coalescing map treats them as the same/different key.
  vi.stubGlobal('$fetch', vi.fn(() => {
    fetchCallCount += 1
    return new Promise((resolve) => { pendingResolvers.push(resolve) })
  }))

  contextModule = await import('../../../../server/utils/context-unified')
})

afterEach(() => vi.unstubAllGlobals())

describe('DMSM config cache keys include env (BL-967 p01-04)', () => {
  it('does not use either bare `${multiSiteCode}:${siteCode}` literal anymore', async () => {
    runtime.env = 'dev'
    const p1 = contextModule.getCachedDmsmConfig(eventFor() as never, 'site1')
    pendingResolvers.shift()?.({ defaultLocale: 'en', locales: ['en'] })
    await p1

    expect(capturedCachedFunctionKeys[0]).not.toBe('bl2:site1')
    expect(capturedCachedFunctionKeys[0]).toContain('dev')
    expect(capturedCachedFunctionKeys[0]).toContain('bl2')
    expect(capturedCachedFunctionKeys[0]).toContain('site1')
  })

  it('produces a different cachedFunction key for the same site under dev vs prod', async () => {
    runtime.env = 'dev'
    const devCall = contextModule.getCachedDmsmConfig(eventFor() as never, 'site1')
    pendingResolvers.shift()?.({ defaultLocale: 'en', locales: ['en'] })
    await devCall

    runtime.env = 'prod'
    const prodCall = contextModule.getCachedDmsmConfig(eventFor() as never, 'site1')
    pendingResolvers.shift()?.({ defaultLocale: 'en', locales: ['en'] })
    await prodCall

    expect(capturedCachedFunctionKeys).toHaveLength(2)
    expect(capturedCachedFunctionKeys[0]).not.toBe(capturedCachedFunctionKeys[1])
  })

  it('does not collapse two envs into one in-flight coalescing promise for the same site', async () => {
    runtime.env = 'dev'
    const devPromise = contextModule.getCachedDmsmConfig(eventFor() as never, 'site1')

    runtime.env = 'prod'
    const prodPromise = contextModule.getCachedDmsmConfig(eventFor() as never, 'site1')

    // If the coalescing key omitted `env`, the second call would have reused the
    // first's in-flight promise instead of issuing its own $fetch.
    expect(fetchCallCount).toBe(2)

    pendingResolvers[0]?.({ defaultLocale: 'en', locales: ['en'], country: 'dev-config' })
    pendingResolvers[1]?.({ defaultLocale: 'en', locales: ['en'], country: 'prod-config' })

    const [devConfig, prodConfig] = await Promise.all([devPromise, prodPromise])
    expect(devConfig?.country).toBe('dev-config')
    expect(prodConfig?.country).toBe('prod-config')
  })

  it('still coalesces concurrent requests for the same site within the same env', async () => {
    runtime.env = 'dev'
    const first = contextModule.getCachedDmsmConfig(eventFor() as never, 'site1')
    const second = contextModule.getCachedDmsmConfig(eventFor() as never, 'site1')

    expect(fetchCallCount).toBe(1)

    pendingResolvers[0]?.({ defaultLocale: 'en', locales: ['en'] })
    await Promise.all([first, second])
  })
})
