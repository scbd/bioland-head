import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

import { getCanonicalHost } from '~/shared/utils/site-host'

// Bind the Nitro auto-imports the route relies on before importing it in plain-Node Vitest.
const runtimeConfig = { dmsm: 'https://dmsm.test', public: { multiSiteCode: 'bsl' } }
const fetchedUrls: string[] = []
let dmsm: any

class HttpError extends Error {
  statusCode: number
  constructor({ statusCode, statusMessage }: { statusCode: number, statusMessage?: string }) {
    super(statusMessage)
    this.statusCode = statusCode
  }
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', (event: { query: Record<string, unknown> }) => event.query)
vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage?: string }) => new HttpError(opts))
vi.stubGlobal('passError', async (_event: unknown, error: unknown) => { throw error })
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)
vi.stubGlobal('$fetchBaseOptions', () => ({}))
vi.stubGlobal('getCanonicalHost', getCanonicalHost)
vi.stubGlobal('buildDrupalLanguageFilter', (locale: string) => `&filter[langcode]=${locale}`)
vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
  fetchedUrls.push(url)

  if (url.startsWith('https://dmsm.test/')) return dmsm
  if (url.includes('/jsonapi/')) return { meta: { count: 10 } }

  return 'Clearing House Mechanism'
}))

let handler: (event: unknown) => Promise<any>

const call = (query: Record<string, unknown>) => handler({ query })

describe('server/api/chm-network/status', () => {
  beforeAll(async () => {
    handler = (await import('~/server/api/chm-network/status.js')).default as typeof handler
  })

  beforeEach(() => {
    fetchedUrls.length = 0
    dmsm = {
      config: { baseHost: 'bl2.cbddev.xyz' },
      sites: {
        lk: { siteCode: 'lk', defaultLocale: 'en', locales: ['en', 'fr'], published: true },
        bad: { siteCode: 'bad', defaultLocale: 'en', locales: ['../../x'] },
      },
    }
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['cloud metadata url', { url: 'http://169.254.169.254/', env: 'dev', siteCode: '../169.254.169.254' }],
    ['localhost url', { url: 'http://localhost:3000' }],
    ['off-list url', { url: 'https://evil.example', defaultLocale: 'en', locales: 'fr' }],
    ['a site code that is a host', { siteCode: 'evil.example', env: 'dev' }],
    ['an unknown env', { siteCode: 'lk', env: 'http://evil.example' }],
    ['a repeated siteCode', { siteCode: ['lk', 'lk'], env: 'dev' }],
  ])('rejects %s with 400 and zero fetches', async (_label, query) => {
    await expect(call(query)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchedUrls).toEqual([])
  })

  it('resolves a known site host from DMSM and ignores a client-supplied url', async () => {
    const result = await call({ siteCode: 'lk', env: 'dev', url: 'https://evil.example' })

    expect(fetchedUrls[0]).toBe('https://dmsm.test/config/dev/bsl')
    expect(fetchedUrls.slice(1).every(url => url.startsWith('https://lk.bl2.cbddev.xyz/'))).toBe(true)
    expect(fetchedUrls.some(url => url.includes('evil.example'))).toBe(false)
    expect(result).toMatchObject({ siteUp: true, counts: { locales: { en: 10, fr: 10 }, total: 20 } })
  })

  it('404s a site code DMSM does not list, without fetching any site', async () => {
    await expect(call({ siteCode: 'zz', env: 'dev' })).rejects.toMatchObject({ statusCode: 404 })
    expect(fetchedUrls).toEqual(['https://dmsm.test/config/dev/bsl'])
  })

  it('does not treat inherited object keys as sites', async () => {
    await expect(call({ siteCode: 'constructor', env: 'dev' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a site whose locales are malformed, without fetching the site', async () => {
    await expect(call({ siteCode: 'bad', env: 'dev' })).rejects.toMatchObject({ statusCode: 422 })
    expect(fetchedUrls).toEqual(['https://dmsm.test/config/dev/bsl'])
  })
})
