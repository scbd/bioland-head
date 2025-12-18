import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'
import { DateTime } from 'luxon'

// Mock Nuxt auto-imports
global.defineStore = defineStore

// Import store after mocking
const { useMeStore } = await import('~/stores/me.js')

describe('useMeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('State Initialization', () => {
    it('should initialize with default empty values', () => {
      const store = useMeStore()
      
      expect(store.userID).toBe('')
      expect(store.duuid).toBe('')
      expect(store.diuid).toBe('')
      expect(store.preferredLang).toBe('')
      expect(store.displayName).toBe('')
      expect(store.name).toBe('')
      expect(store.email).toBe('')
      expect(store.img).toBe('')
      expect(store.token).toBe('')
    })

    it('should initialize with isAuthenticated as false', () => {
      const store = useMeStore()
      expect(store.isAuthenticated).toBe(false)
    })

    it('should initialize with empty roles array', () => {
      const store = useMeStore()
      expect(store.roles).toEqual([])
      expect(Array.isArray(store.roles)).toBe(true)
    })

    it('should initialize with editMode as true', () => {
      const store = useMeStore()
      expect(store.editMode).toBe(true)
    })
  })

  describe('initialize action', () => {
    it('should set all user properties', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          duuid: 'duuid-456',
          diuid: 'diuid-789',
          preferredLang: 'en',
          displayName: 'John Doe',
          name: 'John',
          email: 'john@example.com',
          img: 'avatar.jpg',
          isAuthenticated: true,
          roles: ['administrator'],
          token: 'token-abc',
        }
      }
      
      store.initialize(user)
      
      expect(store.userID).toBe('user-123')
      expect(store.duuid).toBe('duuid-456')
      expect(store.diuid).toBe('diuid-789')
      expect(store.preferredLang).toBe('en')
      expect(store.displayName).toBe('John Doe')
      expect(store.name).toBe('John')
      expect(store.email).toBe('john@example.com')
      expect(store.img).toBe('avatar.jpg')
      expect(store.isAuthenticated).toBe(true)
      expect(store.roles).toEqual(['administrator'])
      expect(store.token).toBe('token-abc')
    })

    it('should set expiration time to 1 minute from now', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          isAuthenticated: true,
          roles: [],
        }
      }
      
      const beforeInit = DateTime.now().plus({ minutes: 1 })
      store.initialize(user)
      const afterInit = DateTime.now().plus({ minutes: 1 })
      
      const expireTime = DateTime.fromJSDate(store.expire)
      
      expect(expireTime >= beforeInit).toBe(true)
      expect(expireTime <= afterInit).toBe(true)
    })
  })

  describe('toggleEditMode action', () => {
    it('should toggle editMode from true to false', () => {
      const store = useMeStore()
      expect(store.editMode).toBe(true)
      
      store.toggleEditMode()
      expect(store.editMode).toBe(false)
    })

    it('should toggle editMode from false to true', () => {
      const store = useMeStore()
      store.editMode = false
      
      store.toggleEditMode()
      expect(store.editMode).toBe(true)
    })

    it('should toggle multiple times', () => {
      const store = useMeStore()
      
      store.toggleEditMode()
      expect(store.editMode).toBe(false)
      
      store.toggleEditMode()
      expect(store.editMode).toBe(true)
      
      store.toggleEditMode()
      expect(store.editMode).toBe(false)
    })
  })

  describe('logOut action', () => {
    it('should reset all state to default', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          duuid: 'duuid-456',
          email: 'test@example.com',
          isAuthenticated: true,
          roles: ['administrator'],
        }
      }
      
      store.initialize(user)
      store.logOut()
      
      expect(store.userID).toBe('')
      expect(store.duuid).toBe('')
      expect(store.email).toBe('')
      expect(store.isAuthenticated).toBe(false)
      expect(store.roles).toEqual([])
    })
  })

  describe('isAdmin getter', () => {
    it('should return true for administrator role', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.isAdmin).toBeTruthy()
    })

    it('should return false for non-administrator', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['user']
      
      expect(store.isAdmin).toBeFalsy()
    })

    it('should return false when not authenticated', () => {
      const store = useMeStore()
      store.isAuthenticated = false
      store.roles = ['administrator']
      
      expect(store.isAdmin).toBeFalsy()
    })
  })

  describe('isSiteManager getter', () => {
    it('should return true for administrator', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.isSiteManager).toBeTruthy()
    })

    it('should return true for site_manager', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['site_manager']
      
      expect(store.isSiteManager).toBeTruthy()
    })

    it('should return false for content_manager', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['content_manager']
      
      expect(store.isSiteManager).toBeFalsy()
    })

    it('should return false when not authenticated', () => {
      const store = useMeStore()
      store.isAuthenticated = false
      store.roles = ['site_manager']
      
      expect(store.isSiteManager).toBeFalsy()
    })
  })

  describe('isContentManager getter', () => {
    it('should return true for administrator', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.isContentManager).toBeTruthy()
    })

    it('should return true for site_manager', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['site_manager']
      
      expect(store.isContentManager).toBeTruthy()
    })

    it('should return true for content_manager', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['content_manager']
      
      expect(store.isContentManager).toBeTruthy()
    })

    it('should return false for contributor', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['contributor']
      
      expect(store.isContentManager).toBeFalsy()
    })
  })

  describe('isContributor getter', () => {
    it('should return true for administrator', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.isContributor).toBeTruthy()
    })

    it('should return true for contributor', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['contributor']
      
      expect(store.isContributor).toBeTruthy()
    })

    it('should return false for user', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['user']
      
      expect(store.isContributor).toBeFalsy()
    })
  })

  describe('isUser getter', () => {
    it('should return true for any role including user', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['user']
      
      expect(store.isUser).toBeTruthy()
    })

    it('should return true for higher level roles', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.isUser).toBeTruthy()
    })

    it('should return false when not authenticated', () => {
      const store = useMeStore()
      store.isAuthenticated = false
      store.roles = ['user']
      
      expect(store.isUser).toBeFalsy()
    })
  })

  describe('isSiteManagerAndStaff getter', () => {
    it('should return true for admin', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.isSiteManagerAndStaff).toBeTruthy()
    })

    it('should return true for site_manager with cbd.int email', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['site_manager']
      store.email = 'test@cbd.int'
      
      expect(store.isSiteManagerAndStaff).toBeTruthy()
    })

    it('should return true for administrator with un.org email', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      store.email = 'test@un.org'
      
      expect(store.isSiteManagerAndStaff).toBeTruthy()
    })

    it('should return false for site_manager without staff email', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['site_manager']
      store.email = 'test@example.com'
      
      expect(store.isSiteManagerAndStaff).toBeFalsy()
    })
  })

  describe('canEdit getter', () => {
    it('should return true for administrator', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.canEdit).toBeTruthy()
    })

    it('should return true for contributor', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['contributor']
      
      expect(store.canEdit).toBeTruthy()
    })

    it('should return false for user', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['user']
      
      expect(store.canEdit).toBeFalsy()
    })
  })

  describe('canEditMenu getter', () => {
    it('should return true for administrator', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.canEditMenu).toBeTruthy()
    })

    it('should return true for content_manager', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['content_manager']
      
      expect(store.canEditMenu).toBeTruthy()
    })

    it('should return false for contributor', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['contributor']
      
      expect(store.canEditMenu).toBeFalsy()
    })
  })

  describe('canEditSystemPages getter', () => {
    it('should return true only for administrator', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      
      expect(store.canEditSystemPages).toBeTruthy()
    })

    it('should return false for site_manager', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['site_manager']
      
      expect(store.canEditSystemPages).toBeFalsy()
    })
  })

  describe('showEdit getter', () => {
    it('should return true when canEdit and editMode are true', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['contributor']
      store.editMode = true
      
      expect(store.showEdit).toBeTruthy()
    })

    it('should return false when editMode is false', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['contributor']
      store.editMode = false
      
      expect(store.showEdit).toBeFalsy()
    })

    it('should return false when canEdit is false', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['user']
      store.editMode = true
      
      expect(store.showEdit).toBeFalsy()
    })
  })

  describe('showEditMenu getter', () => {
    it('should return true when canEditMenu and editMode are true', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['content_manager']
      store.editMode = true
      
      expect(store.showEditMenu).toBeTruthy()
    })

    it('should return false when editMode is false', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['content_manager']
      store.editMode = false
      
      expect(store.showEditMenu).toBeFalsy()
    })
  })

  describe('showEditSystemPages getter', () => {
    it('should return true when canEditSystemPages and editMode are true', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      store.editMode = true
      
      expect(store.showEditSystemPages).toBeTruthy()
    })

    it('should return false when editMode is false', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator']
      store.editMode = false
      
      expect(store.showEditSystemPages).toBeFalsy()
    })
  })

  describe('user getter', () => {
    it('should return user object with all properties', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          duuid: 'duuid-456',
          diuid: 'diuid-789',
          preferredLang: 'en',
          displayName: 'John Doe',
          name: 'John',
          email: 'john@example.com',
          img: 'avatar.jpg',
          isAuthenticated: true,
          roles: ['administrator'],
          token: 'token-abc',
        }
      }
      
      store.initialize(user)
      
      const userObject = store.user
      
      expect(userObject.userID).toBe('user-123')
      expect(userObject.duuid).toBe('duuid-456')
      expect(userObject.diuid).toBe('diuid-789')
      expect(userObject.preferredLang).toBe('en')
      expect(userObject.displayName).toBe('John Doe')
      expect(userObject.name).toBe('John')
      expect(userObject.email).toBe('john@example.com')
      expect(userObject.img).toBe('avatar.jpg')
      expect(userObject.isAuthenticated).toBe(true)
      expect(userObject.roles).toEqual(['administrator'])
    })

    it('should not include token in user object', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          token: 'secret-token',
          isAuthenticated: true,
          roles: [],
        }
      }
      
      store.initialize(user)
      
      expect(store.user.token).toBeUndefined()
    })
  })

  describe('isExpired getter', () => {
    it('should return false when not expired', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          isAuthenticated: true,
          roles: ['user'],
        }
      }
      
      store.initialize(user)
      
      expect(store.isExpired).toBe(false)
    })

    it('should return true when expired', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          isAuthenticated: true,
          roles: ['user'],
        }
      }
      
      store.initialize(user)
      // Set expire to past time as ISO string (how DateTime.fromISO expects it)
      store.expire = DateTime.now().minus({ minutes: 10 }).toISO()
      
      expect(store.isExpired).toBe(true)
    })

    it('should reset state when expired except editMode', () => {
      const store = useMeStore()
      const user = {
        value: {
          userID: 'user-123',
          email: 'test@example.com',
          isAuthenticated: true,
          roles: ['user'],
        }
      }
      
      store.initialize(user)
      store.editMode = false
      store.expire = DateTime.now().minus({ minutes: 10 }).toISO()
      
      // Trigger isExpired getter
      const expired = store.isExpired
      
      expect(expired).toBe(true)
      expect(store.userID).toBe('')
      expect(store.email).toBe('')
      expect(store.isAuthenticated).toBe(false)
      expect(store.editMode).toBe(false) // editMode should be preserved
    })
  })

  describe('Edge Cases', () => {
    it('should handle user with multiple roles', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['administrator', 'site_manager', 'content_manager']
      
      expect(store.isAdmin).toBeTruthy()
      expect(store.isSiteManager).toBeTruthy()
      expect(store.isContentManager).toBeTruthy()
    })

    it('should handle user without email', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = ['site_manager']
      store.email = ''
      
      // Should not throw error
      expect(store.isSiteManagerAndStaff).toBeFalsy()
    })

    it('should handle empty roles array', () => {
      const store = useMeStore()
      store.isAuthenticated = true
      store.roles = []
      
      expect(store.isAdmin).toBeFalsy()
      expect(store.isSiteManager).toBeFalsy()
      expect(store.canEdit).toBeFalsy()
    })
  })
})
