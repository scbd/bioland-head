import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let handler: (event: any) => void

const eventFor = (path: string, method = 'GET') => ({
  path,
  method,
  node: {
    res: {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    },
  },
})

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('defineEventHandler', (fn: any) => fn)
  vi.stubGlobal('consola', { debug: vi.fn() })
  handler = (await import('~/server/middleware/00.scanner-404')).default
})

afterEach(() => vi.unstubAllGlobals())

describe('00.scanner-404 middleware', () => {
  describe('blocked scanner-shaped paths', () => {
    it.each([
      '/static/wap/js/order.js',
      '/wp-login.php',
      '/ipfs/bafkreigh2akiscaildc',
      '/.env',
      '/wp-admin/setup.php',
      '/xy/probe',
      '/h5/probe',
      '/phpmyadmin/index.php',
      '/cgi-bin/test.cgi',
      '/vendor/phpunit/phpunit',
      '/.git/config',
      '/de/wp-login.php',
      '/wap',
      '/wap/index',
      '/cgi-bin/x',
      '/wp-login%2Ephp',
      '//wp-login.php',
      '/wp-login.php.',
      '/wp-login.php;x=1',
      '/WP-LOGIN.PHP',
      '/wp-login.php?foo=bar',
      '/%2e%65nv',
    ])('returns a fast plain-text 404 for %s without touching $fetch', (path) => {
      const event = eventFor(path)
      const result = handler(event)

      expect(result).toBeUndefined()
      expect(event.node.res.statusCode).toBe(404)
      expect(event.node.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8')
      expect(event.node.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
      expect(event.node.res.end).toHaveBeenCalledWith('Not Found')
    })

    it('sends the 404 with no body for HEAD requests', () => {
      const event = eventFor('/wp-login.php', 'HEAD')
      handler(event)

      expect(event.node.res.statusCode).toBe(404)
      expect(event.node.res.end).toHaveBeenCalledWith()
    })

    it('logs the normalized path JSON-encoded and truncated', () => {
      handler(eventFor(`/wp-login.php/${'a'.repeat(300)}\n`))

      const message = (consola.debug as any).mock.calls[0][0] as string
      expect(message).not.toContain('\n')
      expect(message.length).toBeLessThan(260)
    })
  })

  describe('allowed / passthrough paths', () => {
    it.each([
      '/_nuxt/entry.js',
      '/__nuxt_error',
      '/api/page/x',
      '/_ipx/image',
      '/_i18n/en',
      '/en/sitemap.xml',
      '/sitemap.xml',
      '/robots.txt',
      '/en/some-alias',
      '/en/document/acb-plan-pdf',
      '/images/flags/x.svg',
      '/favicon.ico',
      '/.well-known/acme-challenge/token',
      '/v2',
      '/wapato-conservation',
      '/en/wapato-park',
      '/wapato-national-park',
      '/wordpress-tips',
      '/en/cgi-binder',
      '/h5',
      '/En/Some-Alias',
      '/en/some-alias?page=2',
      '/en//some-alias',
      '/en/bad%E0%A4%A',
    ])('passes through %s untouched', (path) => {
      const event = eventFor(path)
      const result = handler(event)

      expect(result).toBeUndefined()
      expect(event.node.res.statusCode).toBe(200)
      expect(event.node.res.setHeader).not.toHaveBeenCalled()
      expect(event.node.res.end).not.toHaveBeenCalled()
    })
  })
})
