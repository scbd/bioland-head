import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'

let ctx: Record<string, unknown> | null
let ctxError: Error | null
const setHeaders: Record<string, string> = {}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('setResponseHeader', (_event: unknown, name: string, value: string) => {
  setHeaders[name] = value
})
vi.stubGlobal('useRequestContext', async () => {
  if (ctxError) throw ctxError
  return ctx
})
vi.stubGlobal('CACHE_TTL', { ONE_HOUR: 3600 })
vi.stubGlobal('consola', { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() })

let handler: (event: unknown) => Promise<string>

describe('server/routes/robots.txt', () => {
  beforeAll(async () => {
    handler = (await import('~/server/routes/robots.txt')).default as typeof handler
  })

  beforeEach(() => {
    ctx = { host: 'https://be.bl2.chm-cbd.net', defaultLocale: 'en', config: { published: true } }
    ctxError = null
    for (const key of Object.keys(setHeaders)) delete setHeaders[key]
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('allows crawling and points at the sitemap when the site is published', async () => {
    const body = await handler({})

    expect(body).toContain('User-agent: *')
    expect(body).toContain('Allow: /')
    expect(body).toContain('Sitemap: https://be.bl2.chm-cbd.net/en/sitemap.xml')
    expect(setHeaders['Content-Type']).toContain('text/plain')
  })

  it('disallows crawling when the site is unpublished', async () => {
    ctx!.config = { published: false }

    const body = await handler({})

    expect(body).toBe('User-agent: *\nDisallow: /\n')
  })

  it('disallows crawling when the published flag is missing', async () => {
    ctx!.config = {}

    const body = await handler({})

    expect(body).toBe('User-agent: *\nDisallow: /\n')
  })

  it('disallows crawling when there is no config at all', async () => {
    ctx!.config = undefined

    const body = await handler({})

    expect(body).toBe('User-agent: *\nDisallow: /\n')
  })

  it('disallows crawling when resolving the site context throws (config-fetch failure, bad host, etc.)', async () => {
    ctxError = new Error('Site configuration not found')

    const body = await handler({})

    expect(body).toBe('User-agent: *\nDisallow: /\n')
  })

  it('always sets a text/plain content type and cache-control header', async () => {
    await handler({})

    expect(setHeaders['Content-Type']).toBe('text/plain; charset=utf-8')
    expect(setHeaders['Cache-Control']).toBe('public, max-age=3600')
  })
})
