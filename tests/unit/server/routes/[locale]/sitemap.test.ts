import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

// Bind the Nitro auto-imports the routes rely on before importing them in plain-Node Vitest.
const store = new Map<string, unknown>()

let ctx: Record<string, unknown>
let routerParam: string

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => routerParam)
vi.stubGlobal('useRequestContext', async () => ctx)
vi.stubGlobal('useStorage', () => ({
  getItem: async (key: string) => (store.has(key) ? store.get(key) : null),
  setItem: async (key: string, value: unknown) => { store.set(key, value) },
}))
vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode

  return error
})
vi.stubGlobal('setResponseHeader', vi.fn())

const HOST = 'https://be.bl2.chm-cbd.net'
const OLD_XML_KEY = 'sitemaps/bl2-be-en.xml'
const NEW_XML_KEY = 'sitemaps/bl2-be-be.bl2.chm-cbd.net-en.xml'
const OLD_HTML_KEY = 'sitemaps/bl2-be-en.html'
const NEW_HTML_KEY = 'sitemaps/bl2-be-be.bl2.chm-cbd.net-en.html'

let xmlHandler: (event: unknown) => Promise<string>
let htmlHandler: (event: unknown) => Promise<string>

describe('server/routes/[locale] sitemaps', () => {
  beforeAll(async () => {
    xmlHandler = (await import('~/server/routes/[locale]/sitemap.xml.js')).default as typeof xmlHandler
    htmlHandler = (await import('~/server/routes/[locale]/sitemap.html.js')).default as typeof htmlHandler
  })

  beforeEach(() => {
    store.clear()
    routerParam = 'en'
    ctx = { locales: ['en', 'fr'], multiSiteCode: 'bl2', siteCode: 'be', host: HOST }
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('generates the xml sitemap from ctx.host, never a hardcoded domain', async () => {
    ctx.siteCode = 'seed'
    ctx.multiSiteCode = 'bsl'
    ctx.host = 'https://seed.bsl.chm-cbd.net'

    const body = await xmlHandler({})

    expect(body).toContain('<loc>https://seed.bsl.chm-cbd.net/en</loc>')
    expect(body).not.toContain('bl2.chm-cbd.net')
  })

  it('ignores a stale body cached under the old host-less xml key', async () => {
    store.set(OLD_XML_KEY, '<urlset><url><loc>https://stale.example.test/en</loc></url></urlset>')

    const body = await xmlHandler({})

    expect(body).not.toContain('stale.example.test')
    expect(body).toContain(`<loc>${HOST}/en</loc>`)
    expect(store.get(OLD_XML_KEY)).toContain('stale.example.test')
    expect(store.has(NEW_XML_KEY)).toBe(true)
  })

  it('serves the host-aware xml key on a second request', async () => {
    store.set(NEW_XML_KEY, '<cached-xml/>')

    await expect(xmlHandler({})).resolves.toBe('<cached-xml/>')
  })

  it('keys the xml sitemap by the canonical hostname so a host change misses the cache', async () => {
    await xmlHandler({})
    ctx.host = 'https://be.vanity.example.test'
    await xmlHandler({})

    expect(store.has(NEW_XML_KEY)).toBe(true)
    expect(store.has('sitemaps/bl2-be-be.vanity.example.test-en.xml')).toBe(true)
  })

  it('generates the html sitemap from ctx.host and ignores the old key', async () => {
    store.set(OLD_HTML_KEY, '<html>stale.example.test</html>')

    const body = await htmlHandler({})

    expect(body).toContain(`href="${HOST}/en"`)
    expect(body).not.toContain('stale.example.test')
    expect(store.has(NEW_HTML_KEY)).toBe(true)
  })

  it('serves the host-aware html key on a second request', async () => {
    store.set(NEW_HTML_KEY, '<cached-html/>')

    await expect(htmlHandler({})).resolves.toBe('<cached-html/>')
  })

  it('rejects an unsupported locale on both routes', async () => {
    routerParam = 'de'

    await expect(xmlHandler({})).rejects.toThrow('Failed to load sitemap')
    await expect(htmlHandler({})).rejects.toThrow('Failed to load sitemap')
  })
})
