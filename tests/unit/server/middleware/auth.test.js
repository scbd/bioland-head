import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

// Mock the getUser and getToken functions
const mockGetUser = vi.fn()
const mockGetToken = vi.fn()

// Set up global mocks before any imports
global.defineEventHandler = vi.fn((handler) => handler)
global.getRequestURL = vi.fn()
global.getHeader = vi.fn()  
global.getUser = mockGetUser
global.getToken = mockGetToken

// Mock h3 module 
vi.mock('h3', () => ({
  defineEventHandler: global.defineEventHandler,
  getRequestURL: global.getRequestURL,
  getHeader: global.getHeader
}))

vi.mock('../../../../server/utils/drupal/drupal-user', () => ({
  getUser: global.getUser,
  getToken: global.getToken
}))

describe('Auth Middleware', () => {
  let mockEvent
  let authMiddleware

  beforeAll(async () => {
    // Import the middleware after mocks
    const authMiddlewareModule = await import('../../../../server/middleware/auth.js')
    authMiddleware = authMiddlewareModule.default
  })

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup mock event
    mockEvent = {
      context: {},
      node: {
        req: {},
        res: {}
      }
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Skip paths', () => {
    const skipPaths = [
      '/api/menus/topics',
      '/api/menus/drupal',
      '/api/menus/system-page',
      '/_ipx',
      '/api/context',
      '/__nuxt_error',
      '/_nuxt',
      '/api/menus/absch',
      '/api/menus/bch',
      '/api/menus/nr',
      '/api/menus/nr6',
      '/api/menus/nbsap',
      '/api/menus/focal-points',
      '/api/menus/content-types',
      '/api/menus/languages'
    ]

    skipPaths.forEach((path) => {
      it(`should skip authentication for ${path}`, async () => {
        global.getRequestURL.mockReturnValue(new URL(`http://localhost${path}`))

        await authMiddleware(mockEvent)

        expect(mockGetUser).not.toHaveBeenCalled()
        expect(mockEvent.context.me).toBeUndefined()
      })
    })

    it('should skip authentication for nested paths under skip prefixes', async () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/_ipx/image.jpg'))

      await authMiddleware(mockEvent)

      expect(mockGetUser).not.toHaveBeenCalled()
      expect(mockEvent.context.me).toBeUndefined()
    })

    it('should skip authentication for /_nuxt assets', async () => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/_nuxt/bundle.js'))

      await authMiddleware(mockEvent)

      expect(mockGetUser).not.toHaveBeenCalled()
      expect(mockEvent.context.me).toBeUndefined()
    })
  })

  describe('User authentication and role detection', () => {
    beforeEach(() => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/page'))
      global.getHeader.mockReturnValue('test-cookie')
    })

    it('should fetch user data for non-skipped paths', async () => {
      const mockUser = {
        roles: [],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockGetUser).toHaveBeenCalledWith(mockEvent)
      expect(mockEvent.context.me).toBeDefined()
    })

    it('should set isAdmin flag for administrator role', async () => {
      const mockUser = {
        roles: ['administrator'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAdmin).toBe(true)
    })

    it('should set isSiteManager flag for site_manager role', async () => {
      const mockUser = {
        roles: ['site_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isSiteManager).toBe(true)
    })

    it('should set isSiteManager flag for administrator', async () => {
      const mockUser = {
        roles: ['administrator'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAdmin).toBe(true)
      expect(mockEvent.context.me.isSiteManager).toBe(true)
    })

    it('should set isContentManager flag for content_manager role', async () => {
      const mockUser = {
        roles: ['content_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isContentManager).toBe(true)
    })

    it('should set isContentManager flag for site_manager', async () => {
      const mockUser = {
        roles: ['site_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isSiteManager).toBe(true)
      expect(mockEvent.context.me.isContentManager).toBe(true)
    })

    it('should set isContentManager flag for administrator', async () => {
      const mockUser = {
        roles: ['administrator'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAdmin).toBe(true)
      expect(mockEvent.context.me.isContentManager).toBe(true)
    })

    it('should set isContributor flag for contributor role', async () => {
      const mockUser = {
        roles: ['contributor'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isContributor).toBe(true)
    })

    it('should set isContributor flag for content_manager', async () => {
      const mockUser = {
        roles: ['content_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isContentManager).toBe(true)
      expect(mockEvent.context.me.isContributor).toBe(true)
    })

    it('should set isAuthenticated flag for users without special roles', async () => {
      const mockUser = {
        roles: [],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAuthenticated).toBe(true)
      expect(mockEvent.context.me.isAdmin).toBe(false)
      expect(mockEvent.context.me.isSiteManager).toBe(false)
      expect(mockEvent.context.me.isContentManager).toBe(false)
      expect(mockEvent.context.me.isContributor).toBe(false)
    })

    it('should not set isAuthenticated flag for content_manager', async () => {
      const mockUser = {
        roles: ['content_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isContentManager).toBe(true)
      expect(mockEvent.context.me.isAuthenticated).toBe(false)
    })
  })

  describe('Token and headers handling', () => {
    beforeEach(() => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/page'))
    })

    it('should fetch token for authenticated users without special roles', async () => {
      const mockUser = {
        roles: [],
        isAuthenticated: true
      }
      const mockToken = 'test-csrf-token'
      
      mockGetUser.mockResolvedValue(mockUser)
      mockGetToken.mockResolvedValue(mockToken)
      global.getHeader.mockReturnValue('cookie-value')

      await authMiddleware(mockEvent)

      expect(mockGetToken).toHaveBeenCalledWith(mockEvent)
      expect(mockEvent.context.token).toBe(mockToken)
    })

    it('should set headers with token for authenticated non-privileged users', async () => {
      const mockUser = {
        roles: [],
        isAuthenticated: true
      }
      const mockToken = 'test-csrf-token'
      const mockCookie = 'session=abc123'
      
      mockGetUser.mockResolvedValue(mockUser)
      mockGetToken.mockResolvedValue(mockToken)
      global.getHeader.mockReturnValue(mockCookie)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.headers).toEqual({
        'Content-Type': 'application/vnd.api+json',
        'X-CSRF-Token': mockToken,
        Cookie: mockCookie
      })
    })

    it('should set base headers without token for non-authenticated users', async () => {
      const mockUser = {
        roles: [],
        isAuthenticated: false
      }
      const mockCookie = 'session=abc123'
      
      mockGetUser.mockResolvedValue(mockUser)
      global.getHeader.mockReturnValue(mockCookie)

      await authMiddleware(mockEvent)

      expect(mockGetToken).not.toHaveBeenCalled()
      expect(mockEvent.context.headers).toEqual({
        'Content-Type': 'application/vnd.api+json',
        Cookie: mockCookie
      })
      expect(mockEvent.context.token).toBeUndefined()
    })

    it('should handle missing cookie header', async () => {
      const mockUser = {
        roles: [],
        isAuthenticated: false
      }
      
      mockGetUser.mockResolvedValue(mockUser)
      global.getHeader.mockReturnValue(undefined)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.headers).toEqual({
        'Content-Type': 'application/vnd.api+json',
        Cookie: undefined
      })
    })
  })

  describe('Error handling', () => {
    beforeEach(() => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/page'))
      global.getHeader.mockReturnValue('test-cookie')
    })

    it('should handle getUser errors gracefully', async () => {
      mockGetUser.mockRejectedValue(new Error('User fetch failed'))

      await expect(authMiddleware(mockEvent)).rejects.toThrow('User fetch failed')
    })

    it('should handle getToken errors gracefully', async () => {
      const mockUser = {
        roles: [],
        isAuthenticated: true
      }
      
      mockGetUser.mockResolvedValue(mockUser)
      mockGetToken.mockRejectedValue(new Error('Token fetch failed'))
      global.getHeader.mockReturnValue('cookie')

      await expect(authMiddleware(mockEvent)).rejects.toThrow('Token fetch failed')
    })
  })

  describe('Role hierarchy', () => {
    beforeEach(() => {
      global.getRequestURL.mockReturnValue(new URL('http://localhost/api/page'))
      global.getHeader.mockReturnValue('test-cookie')
    })

    it('should respect role hierarchy for administrator', async () => {
      const mockUser = {
        roles: ['administrator'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)
      mockGetToken.mockResolvedValue('token')

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAdmin).toBe(true)
      expect(mockEvent.context.me.isSiteManager).toBe(true)
      expect(mockEvent.context.me.isContentManager).toBe(true)
      expect(mockEvent.context.me.isContributor).toBe(true)
      expect(mockEvent.context.me.isAuthenticated).toBe(false) // Content managers don't get this flag
    })

    it('should respect role hierarchy for site_manager', async () => {
      const mockUser = {
        roles: ['site_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)
      mockGetToken.mockResolvedValue('token')

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAdmin).toBe(false)
      expect(mockEvent.context.me.isSiteManager).toBe(true)
      expect(mockEvent.context.me.isContentManager).toBe(true)
      expect(mockEvent.context.me.isContributor).toBe(true)
      expect(mockEvent.context.me.isAuthenticated).toBe(false)
    })

    it('should respect role hierarchy for content_manager', async () => {
      const mockUser = {
        roles: ['content_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)
      mockGetToken.mockResolvedValue('token')

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAdmin).toBe(false)
      expect(mockEvent.context.me.isSiteManager).toBe(false)
      expect(mockEvent.context.me.isContentManager).toBe(true)
      expect(mockEvent.context.me.isContributor).toBe(true)
      expect(mockEvent.context.me.isAuthenticated).toBe(false)
    })

    it('should respect role hierarchy for contributor', async () => {
      const mockUser = {
        roles: ['contributor'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isAdmin).toBe(false)
      expect(mockEvent.context.me.isSiteManager).toBe(false)
      expect(mockEvent.context.me.isContentManager).toBe(false)
      expect(mockEvent.context.me.isContributor).toBe(true)
      expect(mockEvent.context.me.isAuthenticated).toBe(true)
    })

    it('should handle multiple roles correctly', async () => {
      const mockUser = {
        roles: ['contributor', 'content_manager'],
        isAuthenticated: true
      }
      mockGetUser.mockResolvedValue(mockUser)
      mockGetToken.mockResolvedValue('token')

      await authMiddleware(mockEvent)

      expect(mockEvent.context.me.isContentManager).toBe(true)
      expect(mockEvent.context.me.isContributor).toBe(true)
    })
  })
})
