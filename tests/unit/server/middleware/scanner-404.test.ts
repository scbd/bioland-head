import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let handler: (event: any) => void

const eventFor = (path: string) => ({
  path,
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
    ])('returns a fast plain-text 404 for %s without touching $fetch', (path) => {
      const event = eventFor(path)
      const result = handler(event)

      expect(result).toBeUndefined()
      expect(event.node.res.statusCode).toBe(404)
      expect(event.node.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8')
      expect(event.node.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300')
      expect(event.node.res.end).toHaveBeenCalledWith('Not Found')
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
