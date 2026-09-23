import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let drupal, $fetch

beforeEach(async () => {
  vi.resetModules()
  $fetch = vi.fn()
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('$fetchBaseOptions', (o) => o)
  vi.stubGlobal('useRuntimeConfig', () => ({ apiKey: 'k', public: {} }))
  vi.stubGlobal('consola', { debug: vi.fn(), error: vi.fn(), warn: vi.fn() })
  vi.stubGlobal('createError', (o) => Object.assign(new Error(o.message), o))
  vi.stubGlobal('describeError', (e) => ({ statusCode: e?.statusCode, message: String(e?.message ?? e) }))
  vi.stubGlobal('defineCachedFunction', (fn) => fn)
  drupal = await import('~/server/utils/drupal/index.js')
})

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const ctx = { env: 'test', multiSiteCode: 'bl2', siteCode: 'be', locale: 'en', host: 'https://be.test' }

describe('getSiteSettings', () => {
  it('caches real settings', async () => {
    $fetch.mockResolvedValue({ data: { name: 'Belgium', page_front: '/node/1' } })
    await expect(drupal.getSiteSettings(ctx, {})).resolves.toEqual({ siteName: 'Belgium', homePath: '/node/1' })
  })

  it('keeps the "_" placeholder mapping to an empty name', async () => {
    $fetch.mockResolvedValue({ data: { name: '_', page_front: '/home' } })
    await expect(drupal.getSiteSettings(ctx, {})).resolves.toEqual({ siteName: '', homePath: '/home' })
  })

  it.each([
    ['maintenance HTML', '<html>Site under maintenance</html>'],
    ['null body', null],
    ['no data member', { errors: [{ status: '503' }] }],
    ['scalar data', { data: 'nope' }],
  ])('rejects on %s instead of caching undefined settings for 30 days', async (_label, body) => {
    $fetch.mockResolvedValue(body)
    await expect(drupal.getSiteSettings(ctx, {})).rejects.toThrow(/not a JSON:API document/)
  })
})

describe('getSiteSettings failure memo (BL-1122)', () => {
  const good = { data: { name: 'Belgium', page_front: '/node/1' } }

  it('does not re-ask Drupal for a failed site + locale within 60s, retries after', async () => {
    vi.useFakeTimers()
    $fetch.mockResolvedValue('<html>maintenance</html>')

    await expect(drupal.getSiteSettings(ctx, {})).rejects.toThrow(/not a JSON:API document/)
    vi.advanceTimersByTime(59_000)
    await expect(drupal.getSiteSettings(ctx, {})).rejects.toThrow(/not a JSON:API document/)
    expect($fetch).toHaveBeenCalledTimes(1)

    await expect(drupal.getSiteSettings({ ...ctx, locale: 'fr' }, {})).rejects.toThrow()
    expect($fetch).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(2_000)
    $fetch.mockResolvedValue(good)
    await expect(drupal.getSiteSettings(ctx, {})).resolves.toEqual({ siteName: 'Belgium', homePath: '/node/1' })
    expect($fetch).toHaveBeenCalledTimes(3)
  })

  it('retries after the window expires, and a later failure is not memo-served from before', async () => {
    vi.useFakeTimers()
    $fetch.mockResolvedValueOnce('<html>maintenance</html>')
    await expect(drupal.getSiteSettings(ctx, {})).rejects.toThrow()
    vi.advanceTimersByTime(61_000)
    $fetch.mockResolvedValueOnce(good).mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 404 }))
    await expect(drupal.getSiteSettings(ctx, {})).resolves.toEqual({ siteName: 'Belgium', homePath: '/node/1' })
    await expect(drupal.getSiteSettings(ctx, {})).rejects.toThrow(/boom/)
    expect($fetch).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['a 5xx', Object.assign(new Error('bad gateway'), { statusCode: 502 })],
    ['a network error', new TypeError('fetch failed')],
  ])('never remembers %s', async (_label, error) => {
    $fetch.mockRejectedValueOnce(error).mockResolvedValueOnce(good)
    await expect(drupal.getSiteSettings(ctx, {})).rejects.toThrow()
    await expect(drupal.getSiteSettings(ctx, {})).resolves.toEqual({ siteName: 'Belgium', homePath: '/node/1' })
    expect($fetch).toHaveBeenCalledTimes(2)
  })
})
