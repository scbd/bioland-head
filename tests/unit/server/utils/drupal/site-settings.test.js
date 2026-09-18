import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let drupal, $fetch

beforeEach(async () => {
  vi.resetModules()
  $fetch = vi.fn()
  vi.stubGlobal('$fetch', $fetch)
  vi.stubGlobal('$fetchBaseOptions', (o) => o)
  vi.stubGlobal('useRuntimeConfig', () => ({ apiKey: 'k', public: {} }))
  vi.stubGlobal('consola', { debug: vi.fn(), error: vi.fn(), warn: vi.fn() })
  vi.stubGlobal('defineCachedFunction', (fn) => fn)
  drupal = await import('~/server/utils/drupal/index.js')
})

afterEach(() => vi.unstubAllGlobals())

const ctx = { siteCode: 'be', locale: 'en', host: 'https://be.test' }

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
