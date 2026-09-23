import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../../shared/utils/constants'
import { getBaseCacheOptions, rejectNullish } from '~/server/utils/nitro-cache'

// BL-1111: an alias that only exists in one locale used to cost a serial, uncached,
// undeduplicated translate-path sweep across every other locale on every request.

/**
 * In-memory stand-in for nitro's defineCachedFunction with the parts this lookup relies
 * on: getKey from the resolver arguments, validate on read and on write (entries carry
 * mtime), and one shared in-flight resolution per key.
 */
function fakeDefineCachedFunction(fn, opts) {
  const pending = {}

  return async (...args) => {
    const key = await opts.getKey(...args)
    const cached = store.get(key)

    if (cached && opts.validate(cached) !== false) return cached.value

    pending[key] ??= Promise.resolve()
      .then(() => fn(...args))
      .then((value) => {
        const entry = { value, mtime: Date.now() }

        if (opts.validate(entry) !== false) store.set(key, entry)
        return value
      })
      .finally(() => { delete pending[key] })

    return pending[key]
  }
}

// Nitro's real defineCachedFunction, with its storage swapped for the same in-memory map.
const nitroInternal = '../../../../../node_modules/nitropack/dist/runtime/internal'
vi.mock('../../../../../node_modules/nitropack/dist/runtime/internal/storage.mjs', () => ({
  useStorage: () => ({
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value) },
  }),
}))
vi.mock('../../../../../node_modules/nitropack/dist/runtime/internal/app.mjs', () => ({
  useNitroApp: () => ({ captureError: () => {} }),
}))

const notFound = () => Object.assign(new Error('404 Not Found'), { statusCode: 404 })
const serverError = () => Object.assign(new Error('503 Service Unavailable'), { statusCode: 503 })

let store, drupalPage, $fetch, owners, failing

const baseCtx = {
  multiSiteCode: 'bl2',
  siteCode     : 'asean',
  host         : 'https://asean.test',
  localizedHost: 'https://asean.test/en',
  locale       : 'en',
  locales      : ['en', 'fr', 'vi', 'th'],
  path         : '/en/mang-chm',
}
const event = { context: { headers: {} } }

// Which locale answers which alias; everything else 404s.
function drupal(uri, opts) {
  const { pathname, searchParams } = new URL(uri)
  const locale = pathname.split('/')[1]
  const alias  = searchParams.get('path')

  if (failing.has(locale)) return Promise.reject(serverError())
  if (owners[alias] === locale) return Promise.resolve({ entity: { path: alias } })
  return Promise.reject(notFound())
}

const pathHash = (path) => createHash('sha1').update(path).digest('hex').slice(0, 16)

const sweepCalls   = () => $fetch.mock.calls.filter(([uri]) => !uri.startsWith(`${baseCtx.localizedHost}/`))
const primaryCalls = () => $fetch.mock.calls.filter(([uri]) => uri.startsWith(`${baseCtx.localizedHost}/router/translate-path`))

beforeEach(async () => {
  vi.resetModules()
  store   = new Map()
  owners  = { '/mang-chm': 'vi' }
  failing = new Set()
  $fetch  = vi.fn(drupal)

  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('$fetchBaseOptions', (o = {}) => o)
  vi.stubGlobal('consola', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
  vi.stubGlobal('createError', (e) => Object.assign(new Error(e.message), e))
  vi.stubGlobal('CACHE_TTL', CACHE_TTL)
  vi.stubGlobal('getBaseCacheOptions', getBaseCacheOptions)
  vi.stubGlobal('rejectNullish', rejectNullish)
  vi.stubGlobal('defineCachedFunction', fakeDefineCachedFunction)
  vi.stubGlobal('removeLocalizationFromPath', (await import('~/server/utils/drupal/index.js')).removeLocalizationFromPath)

  drupalPage = await import('~/server/utils/drupal/drupal-page.js')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('cross-locale alias fallback (BL-1111)', () => {
  it('redirects to the locale that owns the alias', async () => {
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
  })

  it('asks Drupal under the fil prefix for app locale tl and redirects to /tl (BL-1126)', async () => {
    owners['/tl-only'] = 'fil'
    const ctx = { ...baseCtx, locales: ['en', 'tl'], path: '/en/tl-only' }

    await expect(drupalPage.getPageData(ctx, event)).resolves.toEqual({ redirect: '/tl/tl-only' })
    expect(sweepCalls().map(([uri]) => new URL(uri).pathname)).toEqual(['/fil/router/translate-path'])
  })

  it('asks every other locale at once, silently, and never the requested one', async () => {
    await drupalPage.getPageData({ ...baseCtx }, event)

    expect(sweepCalls().map(([uri]) => new URL(uri).pathname.split('/')[1])).toEqual(['fr', 'vi', 'th'])
    for (const [, opts] of sweepCalls()) {
      expect(opts.silentError).toBe(true)
      expect(opts.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('serves a repeat request from the cache with zero sweep fetches', async () => {
    await drupalPage.getPageData({ ...baseCtx }, event)
    $fetch.mockClear()

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(sweepCalls()).toHaveLength(0)
  })

  it('shares one sweep between concurrent requests for the same alias', async () => {
    await Promise.all(Array.from({ length: 10 }, () => drupalPage.getPageData({ ...baseCtx }, event)))

    expect(sweepCalls()).toHaveLength(3)
  })

  it('remembers a miss in process, never in the shared cache, until the negative TTL expires', async () => {
    const now = Date.now()
    const ctx = { ...baseCtx, path: '/en/nowhere' }

    vi.spyOn(Date, 'now').mockReturnValue(now)
    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(3)
    expect(store.size).toBe(0)

    $fetch.mockClear()
    Date.now.mockReturnValue(now + CACHE_TTL.ALIAS_FALLBACK_MISS * 1000 - 1)
    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(0)

    Date.now.mockReturnValue(now + CACHE_TTL.ALIAS_FALLBACK_MISS * 1000 + 1)
    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(3)
    expect(store.size).toBe(0)
  })

  it('bounds the in-process miss map, evicting the oldest miss first', async () => {
    for (let i = 0; i <= 1000; i++)
      await expect(drupalPage.getPageData({ ...baseCtx, path: `/en/nowhere-${i}` }, event)).rejects.toMatchObject({ statusCode: 404 })

    $fetch.mockClear()
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/nowhere-1000' }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(0)

    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/nowhere-0' }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(3)
  })

  it('keys by site, requested locale and path', async () => {
    await drupalPage.getPageData({ ...baseCtx }, event)
    await drupalPage.getPageData({ ...baseCtx, siteCode: 'be' }, event)
    await drupalPage.getPageData({ ...baseCtx, locale: 'fr', localizedHost: 'https://asean.test/fr', path: '/fr/mang-chm' }, event)
    owners['/ekhruuexkhay-chm'] = 'th'
    await drupalPage.getPageData({ ...baseCtx, path: '/en/ekhruuexkhay-chm' }, event)

    expect([...store.keys()]).toEqual([
      `bl2:asean:en:${pathHash('/mang-chm')}`,
      `bl2:be:en:${pathHash('/mang-chm')}`,
      `bl2:asean:fr:${pathHash('/mang-chm')}`,
      `bl2:asean:en:${pathHash('/ekhruuexkhay-chm')}`,
    ])
  })

  it('keeps paths distinct that storage key normalization would merge', async () => {
    const paths = ['/a/b', '/a:b', '/a,b', '/a?b']

    for (const path of paths) {
      owners[path] = 'vi'
      await expect(drupalPage.getPageData({ ...baseCtx, path: `/en${path}` }, event)).resolves.toEqual({ redirect: `/vi${path}` })
    }

    expect(new Set(store.keys()).size).toBe(paths.length)
  })

  it('times out a hung locale instead of holding the sweep open, and does not cache it', async () => {
    const timeout = new AbortController()
    let hung
    const thAsked = new Promise((resolve) => { hung = resolve })
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    $fetch.mockImplementation((uri, opts) => {
      if (!uri.includes('/th/')) return drupal(uri, opts)
      hung()
      return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)))
    })
    const ctx     = { ...baseCtx, path: '/en/nowhere' }
    const pending = drupalPage.getPageData({ ...ctx }, event)

    await thAsked
    timeout.abort(new DOMException('timed out', 'TimeoutError'))
    await expect(pending).rejects.toMatchObject({ statusCode: 404 })
    expect(AbortSignal.timeout).toHaveBeenCalledWith(5000)
    expect(store.size).toBe(0)

    $fetch.mockImplementation(drupal)
    owners['/nowhere'] = 'th'
    await expect(drupalPage.getPageData({ ...ctx }, event)).resolves.toEqual({ redirect: '/th/nowhere' })
  })

  it('does not cache a miss when a locale could not be asked (BL-1066)', async () => {
    failing.add('th')
    const ctx = { ...baseCtx, path: '/en/nowhere' }

    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(store.size).toBe(0)

    failing.clear()
    owners['/nowhere'] = 'th'
    await expect(drupalPage.getPageData({ ...ctx }, event)).resolves.toEqual({ redirect: '/th/nowhere' })
  })

  it('still resolves when an unrelated locale is failing', async () => {
    failing.add('fr')

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(store.get(`bl2:asean:en:${pathHash('/mang-chm')}`).value).toEqual({ locale: 'vi', entityPath: '/mang-chm' })
  })

  it('answers as soon as the owning locale does and aborts the rest', async () => {
    let signal
    $fetch.mockImplementation((uri, opts) => {
      if (uri.includes('/th/')) {
        signal = opts.signal
        return new Promise(() => {}) // never settles
      }
      return drupal(uri, opts)
    })

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(signal.aborted).toBe(true)
  })

  it('prefers configured locale order over response order', async () => {
    owners['/both'] = 'fr'
    $fetch.mockImplementation(async (uri, opts) => {
      if (uri.includes('/fr/')) await new Promise((r) => setTimeout(r, 20))
      if (uri.includes('/th/')) return { entity: { path: '/both' } }
      return drupal(uri, opts)
    })

    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/both' }, event)).resolves.toEqual({ redirect: '/fr/both' })
  })

  it('stores hits and never misses through nitro\'s real defineCachedFunction', async () => {
    const { defineCachedFunction } = await import(`${nitroInternal}/cache.mjs`)
    vi.stubGlobal('defineCachedFunction', defineCachedFunction)
    vi.resetModules()
    drupalPage = await import('~/server/utils/drupal/drupal-page.js')

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect([...store.keys()]).toEqual([`cache:context:find-alias-in-other-locales:bl2:asean:en:${pathHash('/mang-chm')}.json`])

    $fetch.mockClear()
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(sweepCalls()).toHaveLength(0)

    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/nowhere' }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(store.size).toBe(1)
  })
})

describe('requested-locale alias-fallback redirect cache (BL-1116)', () => {
  it('makes zero Drupal calls (primary or sweep) on a repeat request and returns the same redirect', async () => {
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    $fetch.mockClear()

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(primaryCalls()).toHaveLength(0)
    expect(sweepCalls()).toHaveLength(0)
  })

  it('bounds the redirect map, evicting the oldest entry first', async () => {
    for (let i = 0; i <= 1000; i++) {
      owners[`/mang-chm-${i}`] = 'vi'
      await expect(drupalPage.getPageData({ ...baseCtx, path: `/en/mang-chm-${i}` }, event)).resolves.toEqual({ redirect: `/vi/mang-chm-${i}` })
    }

    $fetch.mockClear()
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/mang-chm-1000' }, event)).resolves.toEqual({ redirect: '/vi/mang-chm-1000' })
    expect(primaryCalls()).toHaveLength(0)
    expect(sweepCalls()).toHaveLength(0)

    // The oldest entry (mang-chm-0) was evicted from the redirect cache, so the primary
    // translate-path call re-runs; the underlying cross-locale sweep result is still
    // cached separately (BL-1111's 1-day ALIAS_FALLBACK_HIT), so it makes no new calls.
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/mang-chm-0' }, event)).resolves.toEqual({ redirect: '/vi/mang-chm-0' })
    expect(primaryCalls()).toHaveLength(1)
    expect(sweepCalls()).toHaveLength(0)
  })

  it('re-runs the primary lookup after the redirect TTL expires', async () => {
    const now = Date.now()

    vi.spyOn(Date, 'now').mockReturnValue(now)
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    $fetch.mockClear()

    Date.now.mockReturnValue(now + CACHE_TTL.ALIAS_REDIRECT * 1000 - 1)
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(primaryCalls()).toHaveLength(0)

    Date.now.mockReturnValue(now + CACHE_TTL.ALIAS_REDIRECT * 1000 + 1)
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(primaryCalls()).toHaveLength(1)
  })

  it('keeps separate cache entries per requested locale', async () => {
    owners['/both'] = 'fr'
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/both' }, event)).resolves.toEqual({ redirect: '/fr/both' })

    owners['/both'] = 'en'
    await expect(drupalPage.getPageData({ ...baseCtx, locale: 'th', localizedHost: 'https://asean.test/th', path: '/th/both' }, event)).resolves.toEqual({ redirect: '/en/both' })

    $fetch.mockClear()
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/both' }, event)).resolves.toEqual({ redirect: '/fr/both' })
    expect(primaryCalls()).toHaveLength(0)
  })

  it('bypasses the redirect cache for an authenticated session; anonymous still hits it (BL-1116 F2)', async () => {
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    $fetch.mockClear()

    const authEvent = { context: { headers: { Cookie: 'SESSabc123=xyz' } } }
    await expect(drupalPage.getPageData({ ...baseCtx }, authEvent)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(primaryCalls()).toHaveLength(1)
    expect(sweepCalls()).toHaveLength(0)

    $fetch.mockClear()
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).resolves.toEqual({ redirect: '/vi/mang-chm' })
    expect(primaryCalls()).toHaveLength(0)
    expect(sweepCalls()).toHaveLength(0)
  })

  it('does not short-circuit normal (non-redirect) alias resolution', async () => {
    // The alias resolves directly in the requested locale, so getPageIdentifiers never
    // enters the redirect branch that writes the cache - the primary translate-path call
    // still runs on every request for it.
    owners['/normal-page'] = 'en'

    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/normal-page' }, event)).rejects.toBeTruthy()
    $fetch.mockClear()

    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/normal-page' }, event)).rejects.toBeTruthy()
    expect(primaryCalls()).toHaveLength(1)
  })
})

describe('canonical redirect under the Drupal fil prefix (BL-1126)', () => {
  const tlCtx = { ...baseCtx, locale: 'tl', locales: ['en', 'tl'], localizedHost: 'https://asean.test/fil' }
  const canonicalAt = (canonical) => $fetch.mockImplementation((uri) => uri.includes('/router/translate-path')
    ? Promise.resolve({ entity: { uuid: 'u', type: 'node', bundle: 'content', canonical } })
    : Promise.resolve({ data: { label: 'x' } }))

  it('redirects a tl node path to the /tl alias Drupal reports as /fil', async () => {
    canonicalAt('https://asean.test/fil/about')

    await expect(drupalPage.getPageData({ ...tlCtx, path: '/tl/node/1' }, event)).resolves.toEqual({ redirect: '/tl/about' })
  })

  it('does not redirect when the /fil canonical is the requested /tl path', async () => {
    canonicalAt('https://asean.test/fil/about')

    const result = await drupalPage.getPageData({ ...tlCtx, path: '/tl/about' }, event).catch((e) => e)

    expect(result?.redirect).toBeUndefined()
  })
})

describe('expected failure logging (BL-1117)', () => {
  // The structured single-line warns from logFailure; the alias sweep logs its own string warns.
  const structuredWarns = () => consola.warn.mock.calls.filter(([arg]) => typeof arg === 'object')

  it('passes silentError: true to primary lookup and logs 404 at debug level', async () => {
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/nowhere' }, event)).rejects.toMatchObject({ statusCode: 404 })

    const [, opts] = primaryCalls()[0]
    expect(opts.silentError).toBe(true)
    // Debug is called for the 404 in the primary lookup
    expect(consola.debug).toHaveBeenCalledWith(expect.stringContaining('404'))
    expect(consola.debug).toHaveBeenCalledWith(expect.stringContaining('/nowhere'))
  })

  it('logs getPageData 404 as single-line warn with no Error object', async () => {
    // Craft a context where the main page fetch will fail with 404
    $fetch.mockImplementation((uri) => {
      if (uri.includes('/router/translate-path')) return Promise.resolve({ entity: { id: '123', path: '/test', type: 'node', bundle: 'content', canonical: 'https://test/en/test', label: 'Test' } })
      // Main page data fetch fails
      return Promise.reject(Object.assign(new Error('Not found'), { statusCode: 404 }))
    })

    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/test' }, event)).rejects.toMatchObject({ statusCode: 404 })

    expect(consola.warn).toHaveBeenCalledWith({ siteCode: 'asean', path: expect.any(String), statusCode: 404, statusMessage: undefined })
  })

  it('logs getPageIdentifiers 503 Drupal login unavailable as one single-line warn', async () => {
    $fetch.mockImplementation(() => Promise.reject(Object.assign(new Error('Service Unavailable'), { statusCode: 503, statusMessage: 'Drupal login unavailable' })))

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).rejects.toMatchObject({ statusCode: 503 })

    expect(structuredWarns()).toHaveLength(1)
    expect(consola.warn).toHaveBeenCalledWith({ siteCode: 'asean', path: expect.any(String), statusCode: 503, statusMessage: 'Drupal login unavailable' })
  })

  it('throws the same error shape as before the logging change', async () => {
    const cause = Object.assign(new Error('Service Unavailable'), { statusCode: 503, statusMessage: 'Drupal login unavailable' })
    $fetch.mockImplementation(() => Promise.reject(cause))

    const err = await drupalPage.getPageData({ ...baseCtx }, event).catch((e) => e)

    expect(Object.keys(err).sort()).toEqual(['data', 'statusCode', 'statusMessage'])
    expect(err).toMatchObject({
      statusCode   : 503,
      statusMessage: 'Drupal login unavailable',
      message      : 'Server.util.drupal-page.getPageData: failed to get page identifiers for site/path: https://asean.test/en/en/mang-chm',
    })
    expect(Object.keys(err.data).sort()).toEqual(['data', 'fatal', 'statusCode', 'statusMessage'])
    expect(err.data).toMatchObject({
      statusCode   : 503,
      statusMessage: 'Drupal login unavailable',
      message      : 'Server.util.drupal-page.getPageIdentifiers: failed to get page identifiers for site/path: https://asean.test/en/mang-chm',
      fatal        : true,
    })
    expect(err.data.data).toBe(cause)
    expect(JSON.parse(JSON.stringify(err.data))).toEqual({ statusCode: 503, statusMessage: 'Drupal login unavailable', fatal: true, data: { statusCode: 503, statusMessage: 'Drupal login unavailable' } })
  })

  it('logs unexpected 500 errors with consola.error stack', async () => {
    $fetch.mockImplementation(() => Promise.reject(Object.assign(new Error('Internal Server Error'), { statusCode: 500 })))

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).rejects.toMatchObject({ statusCode: 500 })

    // Logged once, from getPageIdentifiers; getPageData does not log it again
    expect(consola.error).toHaveBeenCalledTimes(1)
    expect(consola.error).toHaveBeenCalledWith('getPageIdentifiers', expect.any(Error))
    expect(structuredWarns()).toHaveLength(0)
  })

  it.each([401, 403])('logs %i through consola.error, never as a suppressed warn', async (statusCode) => {
    $fetch.mockImplementation(() => Promise.reject(Object.assign(new Error('Denied'), { statusCode })))

    await expect(drupalPage.getPageData({ ...baseCtx }, event)).rejects.toMatchObject({ statusCode })
    await expect(drupalPage.getPageData({ ...baseCtx }, event)).rejects.toMatchObject({ statusCode })

    expect(consola.error).toHaveBeenCalledTimes(2)
    expect(consola.error).toHaveBeenCalledWith('getPageIdentifiers', expect.objectContaining({ statusCode }))
    expect(structuredWarns()).toHaveLength(0)
  })

  it('rate-limits repeated identical warn lines: first print, then suppressed inside window, then suppressed count on next print', async () => {
    const now = Date.now()
    let mockNow = now

    vi.spyOn(Date, 'now').mockImplementation(() => mockNow)
    $fetch.mockImplementation(() => Promise.reject(Object.assign(new Error('Not found'), { statusCode: 404 })))

    // First request: logs both debug (primary + sweep not found) and warn
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/nowhere' }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(consola.debug).toHaveBeenCalledTimes(2)
    expect(consola.warn).toHaveBeenCalledTimes(1)
    const firstWarnCall = consola.warn.mock.calls[0][0]
    expect(firstWarnCall).toHaveProperty('statusCode', 404)

    // Second request (same path, within 60s): rate-limited, no new calls
    consola.warn.mockClear()
    consola.debug.mockClear()
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/nowhere' }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(consola.debug).not.toHaveBeenCalled()
    expect(consola.warn).not.toHaveBeenCalled()

    // Third request (after 60s window): logs again with suppressed count
    consola.warn.mockClear()
    consola.debug.mockClear()
    mockNow = now + 60001
    await expect(drupalPage.getPageData({ ...baseCtx, path: '/en/nowhere' }, event)).rejects.toMatchObject({ statusCode: 404 })
    // Both debug calls print again with suppressed count appended
    expect(consola.debug.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(consola.warn).toHaveBeenCalledTimes(1)
    // Still the structured object; suppressed equals the one failed request inside the window
    expect(consola.warn).toHaveBeenCalledWith({ siteCode: 'asean', path: expect.any(String), statusCode: 404, statusMessage: undefined, suppressed: 1 })

    Date.now.mockRestore()
  })
})
