import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_TTL } from '../../../../../shared/utils/constants'
import { getBaseCacheOptions, identifierToKey, rejectNullish } from '~/server/utils/nitro-cache'

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

const sweepCalls = () => $fetch.mock.calls.filter(([uri]) => !uri.startsWith(`${baseCtx.localizedHost}/`))

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
  vi.stubGlobal('identifierToKey', identifierToKey)
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

  it('caches a miss in every locale until the negative TTL expires, then asks again', async () => {
    const now = Date.now()
    const ctx = { ...baseCtx, path: '/en/nowhere' }

    vi.spyOn(Date, 'now').mockReturnValue(now)
    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(3)

    $fetch.mockClear()
    Date.now.mockReturnValue(now + CACHE_TTL.ALIAS_FALLBACK_MISS * 1000 - 1)
    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(0)

    Date.now.mockReturnValue(now + CACHE_TTL.ALIAS_FALLBACK_MISS * 1000 + 1)
    await expect(drupalPage.getPageData({ ...ctx }, event)).rejects.toMatchObject({ statusCode: 404 })
    expect(sweepCalls()).toHaveLength(3)
  })

  it('keys by site, requested locale and path', async () => {
    await drupalPage.getPageData({ ...baseCtx }, event)
    await drupalPage.getPageData({ ...baseCtx, siteCode: 'be' }, event)
    await drupalPage.getPageData({ ...baseCtx, locale: 'fr', localizedHost: 'https://asean.test/fr', path: '/fr/mang-chm' }, event)
    owners['/ekhruuexkhay-chm'] = 'th'
    await drupalPage.getPageData({ ...baseCtx, path: '/en/ekhruuexkhay-chm' }, event)

    expect([...store.keys()]).toEqual([
      'bl2:asean:en:/mang-chm',
      'bl2:be:en:/mang-chm',
      'bl2:asean:fr:/mang-chm',
      'bl2:asean:en:/ekhruuexkhay-chm',
    ])
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
    expect(store.get('bl2:asean:en:/mang-chm').value).toEqual({ locale: 'vi', entityPath: '/mang-chm' })
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
})
