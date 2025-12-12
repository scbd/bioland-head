import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

// Set up global mocks before any imports
global.defineEventHandler = vi.fn((handler) => handler)
global.getRequestURL = vi.fn()

// Mock h3 module
vi.mock('h3', () => ({
  defineEventHandler: global.defineEventHandler,
  getRequestURL: global.getRequestURL
}))

describe('Cache Control Middleware', () => {
  let mockEvent
  let mockRes
  let cacheControlMiddleware

  beforeAll(async () => {
    // Import the middleware after mocks
    const cacheControlMiddlewareModule = await import('../../../../server/middleware/cache-control.js')
    cacheControlMiddleware = cacheControlMiddlewareModule.default
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock response
    mockRes = {
      setHeader: vi.fn()
    }

    // Setup mock event
    mockEvent = {
      node: {
        res: mockRes
      }
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('No-cache paths', () => {
    it('should set no-cache for /api/me endpoints', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/me'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should set no-cache for /api/comments endpoints', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/comments/123'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should set no-cache for /api/forums endpoints with UUID pattern', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/forums/abc-def-012/f0e-1a2-3b4')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should not set no-cache for /api/forums without proper UUID pattern', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/forums'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })
  })

  describe('Bypass cache query parameters', () => {
    it('should set no-cache when bypass-cache query param is present', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/page?bypass-cache=1')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should set no-cache when seachain-taisce query param is present', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/page?seachain-taisce=true')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should handle false string values for bypass-cache as truthy', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/page?bypass-cache=false')
      )

      cacheControlMiddleware(mockEvent)

      // URL searchParams.get() returns string 'false' which is truthy
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })
  })

  describe('Asset caching', () => {
    const year = 31536000
    const week = 60 * 60 * 24 * 7

    const assetExtensions = [
      'avif',
      'webp',
      'jpg',
      'jpeg',
      'gif',
      'css',
      'png',
      'js',
      'ico',
      'svg',
      'mjs'
    ]

    assetExtensions.forEach((ext) => {
      it(`should set long-term cache for .${ext} files`, () => {
        global.getRequestURL.mockReturnValue(
          new URL(`http://localhost/assets/file.${ext}`)
        )

        cacheControlMiddleware(mockEvent)

        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Cache-Control',
          `max-age=${year}, stale-if-error=${week}`
        )
      })
    })

    it('should set long-term cache for /_ipx/ paths', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/_ipx/f_webp/image.jpg')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=${year}, stale-if-error=${week}`
      )
    })

    it('should set long-term cache for /_nuxt/ paths', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/_nuxt/bundle-abc123.js')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=${year}, stale-if-error=${week}`
      )
    })

    it('should handle asset paths with query parameters', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/assets/style.css?v=123')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=${year}, stale-if-error=${week}`
      )
    })
  })

  describe('Default caching', () => {
    const day = 60 * 60 * 24
    const week = 60 * 60 * 24 * 7

    it('should set default cache for API pages', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/page/home'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })

    it('should set default cache for regular pages', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/about'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })

    it('should set default cache for root path', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })

    it('should set default cache for nested paths', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/en/about/contact')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })
  })

  describe('Menus API caching', () => {
    const day = 60 * 60 * 24
    const week = 60 * 60 * 24 * 7

    it('should set default cache for /api/menus/ endpoints', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/menus/main')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })

    it('should set default cache for /api/menus/footer', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/menus/footer')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })
  })

  describe('Priority and edge cases', () => {
    it('should prioritize no-cache over asset caching for /api/me', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/me.json'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should prioritize bypass-cache query over asset caching', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/style.css?bypass-cache=1')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should handle paths with special characters', () => {
      const day = 60 * 60 * 24
      const week = 60 * 60 * 24 * 7

      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/page/test%20page')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })

    it('should handle paths with hashes', () => {
      const day = 60 * 60 * 24
      const week = 60 * 60 * 24 * 7

      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/page#section')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })

    it('should call setHeader exactly once per request', () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/test'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledTimes(1)
    })
  })

  describe('Cache duration values', () => {
    it('should use correct year duration (31536000 seconds)', () => {
      const year = 31536000
      const week = 60 * 60 * 24 * 7

      global.getRequestURL.mockReturnValue(new URL('http://localhost/style.css'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=${year}, stale-if-error=${week}`
      )
      expect(year).toBe(365 * 24 * 60 * 60)
    })

    it('should use correct week duration (604800 seconds)', () => {
      const week = 60 * 60 * 24 * 7

      expect(week).toBe(604800)
    })

    it('should use correct day duration (86400 seconds)', () => {
      const day = 60 * 60 * 24

      expect(day).toBe(86400)
    })

    it('should use 15 seconds for default max-age', () => {
      const day = 60 * 60 * 24
      const week = 60 * 60 * 24 * 7

      global.getRequestURL.mockReturnValue(new URL('http://localhost/page'))

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })
  })

  describe('Forums API specific handling', () => {
    it('should match forums API with hex UUID pattern', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/forums/a1b2c3d4-e5f6/1234567890abcdef')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should not match forums API without full UUID path', () => {
      const day = 60 * 60 * 24
      const week = 60 * 60 * 24 * 7

      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/forums/list')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })
  })

  describe('Multiple query parameters', () => {
    it('should handle multiple query parameters with bypass-cache', () => {
      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/page?id=123&bypass-cache=1&lang=en')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, max-age=0'
      )
    })

    it('should handle multiple query parameters without bypass flags', () => {
      const day = 60 * 60 * 24
      const week = 60 * 60 * 24 * 7

      global.getRequestURL.mockReturnValue(
        new URL('http://localhost/api/page?id=123&lang=en')
      )

      cacheControlMiddleware(mockEvent)

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        `max-age=15, stale-if-error=${week}, stale-while-revalidate=${day}`
      )
    })
  })
})
