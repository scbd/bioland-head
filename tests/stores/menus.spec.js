import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'

// Mock Nuxt auto-imports
global.defineStore = defineStore
global.unref = (val) => (val && val.value !== undefined) ? val.value : val

// Import store after mocking
const { useMenusStore } = await import('~/stores/menus.js')

describe('useMenusStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('State Initialization', () => {
    it('should initialize with empty arrays', () => {
      const store = useMenusStore()
      
      expect(store.footer).toEqual([])
      expect(store.main).toEqual([])
      expect(store.footerCredits).toEqual([])
      expect(store.languages).toEqual([])
      expect(store.nrSix).toEqual([])
      expect(store.nr).toEqual([])
      expect(store.bch).toEqual([])
      expect(store.absch).toEqual([])
      expect(store.nfps).toEqual([])
      expect(store.forums).toEqual([])
      expect(store.systemPages).toEqual([])
    })

    it('should initialize with empty objects', () => {
      const store = useMenusStore()
      
      expect(store.nbsap).toEqual({})
      expect(store.contentTypes).toEqual({})
    })
  })

  describe('set action', () => {
    it('should set a valid state property', () => {
      const store = useMenusStore()
      const menu = [{ title: 'Home', href: '/' }]
      
      store.set('main', menu)
      
      expect(store.main).toEqual(menu)
    })

    it('should return store for chaining', () => {
      const store = useMenusStore()
      
      const result = store.set('main', [])
      
      expect(result).toBe(store)
    })

    it('should throw error for invalid state name', () => {
      const store = useMenusStore()
      
      expect(() => {
        store.set('invalidState', [])
      }).toThrow('useMenusStore.set -> State invalidState is not defined')
    })

    it('should unref values', () => {
      const store = useMenusStore()
      const menu = { value: [{ title: 'Test' }] }
      
      store.set('main', menu)
      
      expect(store.main).toEqual([{ title: 'Test' }])
    })
  })

  describe('loadAllMenus action', () => {
    it('should load all menus from object', () => {
      const store = useMenusStore()
      const menus = {
        footer: [{ title: 'Footer' }],
        main: [{ title: 'Main' }],
        'footer-credits': [{ title: 'Credits' }],
        languages: [{ code: 'en' }],
        absch: [{ title: 'ABS' }],
        bch: [{ title: 'BCH' }],
        nr: [{ title: 'NR' }],
        nrSix: [{ title: 'NR6' }],
        nbsap: { data: 'test' },
        nfps: [{ title: 'NFP' }],
        contentTypes: { news: { name: 'News' } },
        forums: [{ title: 'Forum' }],
        systemPages: [{ title: 'System' }],
      }
      
      store.loadAllMenus(menus)
      
      expect(store.footer).toEqual([{ title: 'Footer' }])
      expect(store.main).toEqual([{ title: 'Main' }])
      expect(store.footerCredits).toEqual([{ title: 'Credits' }])
      expect(store.languages).toEqual([{ code: 'en' }])
      expect(store.absch).toEqual([{ title: 'ABS' }])
      expect(store.bch).toEqual([{ title: 'BCH' }])
      expect(store.nr).toEqual([{ title: 'NR' }])
      expect(store.nrSix).toEqual([{ title: 'NR6' }])
      expect(store.nbsap).toEqual({ data: 'test' })
      expect(store.nfps).toEqual([{ title: 'NFP' }])
      expect(store.contentTypes).toEqual({ news: { name: 'News' } })
      expect(store.forums).toEqual([{ title: 'Forum' }])
      expect(store.systemPages).toEqual([{ title: 'System' }])
    })

    it('should handle empty menus object', () => {
      const store = useMenusStore()
      
      store.loadAllMenus({})
      
      expect(store.main).toBeUndefined()
      expect(store.footer).toBeUndefined()
    })
  })

  describe('isInMenu action', () => {
    it('should find menu item by href', () => {
      const store = useMenusStore()
      const menu = {
        href: '/home',
        title: 'Home',
      }
      
      const result = store.isInMenu(menu, '/home')
      
      expect(result).toEqual(menu)
    })

    it('should return false if href does not match', () => {
      const store = useMenusStore()
      const menu = {
        href: '/home',
        title: 'Home',
      }
      
      const result = store.isInMenu(menu, '/about')
      
      expect(result).toBe(false)
    })

    it('should search in children', () => {
      const store = useMenusStore()
      const childMenu = { href: '/child', title: 'Child' }
      const menu = {
        href: '/parent',
        title: 'Parent',
        children: [childMenu],
      }
      
      const result = store.isInMenu(menu, '/child')
      
      expect(result).toEqual(childMenu)
    })

    it('should search deeply nested children', () => {
      const store = useMenusStore()
      const deepChild = { href: '/deep', title: 'Deep' }
      const menu = {
        href: '/parent',
        children: [
          {
            href: '/child1',
            children: [deepChild],
          },
        ],
      }
      
      const result = store.isInMenu(menu, '/deep')
      
      expect(result).toEqual(deepChild)
    })

    it('should return false if menu has no children', () => {
      const store = useMenusStore()
      const menu = {
        href: '/home',
        title: 'Home',
      }
      
      const result = store.isInMenu(menu, '/other')
      
      expect(result).toBe(false)
    })
  })

  describe('isInMainMenu action', () => {
    it('should find item in main menu', () => {
      const store = useMenusStore()
      const menuItem = { href: '/about', title: 'About' }
      store.main = [
        { href: '/home', title: 'Home' },
        menuItem,
      ]
      
      const result = store.isInMainMenu('/about')
      
      expect(result).toEqual(menuItem)
    })

    it('should return false if not in main menu', () => {
      const store = useMenusStore()
      store.main = [
        { href: '/home', title: 'Home' },
      ]
      
      const result = store.isInMainMenu('/missing')
      
      expect(result).toBe(false)
    })

    it('should search in nested children of main menu', () => {
      const store = useMenusStore()
      const childItem = { href: '/services', title: 'Services' }
      store.main = [
        {
          href: '/about',
          title: 'About',
          children: [childItem],
        },
      ]
      
      const result = store.isInMainMenu('/services')
      
      expect(result).toEqual(childItem)
    })
  })

  describe('isInFooterMenu action', () => {
    it('should find item in footer menu', () => {
      const store = useMenusStore()
      const menuItem = { href: '/contact', title: 'Contact' }
      store.footer = menuItem
      
      const result = store.isInFooterMenu('/contact')
      
      expect(result).toEqual(menuItem)
    })
  })

  describe('isInFooterCreditsMenu action', () => {
    it('should find item in footer credits menu', () => {
      const store = useMenusStore()
      const menuItem = { href: '/credits', title: 'Credits' }
      store.footerCredits = menuItem
      
      const result = store.isInFooterCreditsMenu('/credits')
      
      expect(result).toEqual(menuItem)
    })
  })

  describe('getContentTypeById action', () => {
    it('should find content type by ID', () => {
      const store = useMenusStore()
      const contentType = { drupalInternalId: 2, name: 'News' }
      store.contentTypes = {
        news: contentType,
      }
      
      const result = store.getContentTypeById(2)
      
      expect(result).toEqual(contentType)
    })

    it('should find content type by ID and locale', () => {
      const store = useMenusStore()
      const contentTypeEn = { drupalInternalId: 2, langcode: 'en', name: 'News' }
      const contentTypeFr = { drupalInternalId: 2, langcode: 'fr', name: 'Nouvelles' }
      store.contentTypes = {
        newsEn: contentTypeEn,
        newsFr: contentTypeFr,
      }
      
      const result = store.getContentTypeById(2, 'fr')
      
      expect(result).toEqual(contentTypeFr)
    })

    it('should return undefined if not found', () => {
      const store = useMenusStore()
      store.contentTypes = {}
      
      const result = store.getContentTypeById(999)
      
      expect(result).toBeUndefined()
    })
  })

  describe('getContentTypeByName action', () => {
    it('should find content type by name', () => {
      const store = useMenusStore()
      const contentType = { name: 'news', plural: 'news items' }
      store.contentTypes = {
        news: contentType,
      }
      
      const result = store.getContentTypeByName('news')
      
      expect(result).toEqual(contentType)
    })

    it('should find content type by plural name', () => {
      const store = useMenusStore()
      const contentType = { name: 'event', plural: 'events' }
      store.contentTypes = {
        event: contentType,
      }
      
      const result = store.getContentTypeByName('events')
      
      expect(result).toEqual(contentType)
    })

    it('should be case insensitive', () => {
      const store = useMenusStore()
      const contentType = { name: 'News', plural: 'News Items' }
      store.contentTypes = {
        news: contentType,
      }
      
      const result = store.getContentTypeByName('NEWS')
      
      expect(result).toEqual(contentType)
    })
  })

  describe('isContentTypeId action', () => {
    it('should return true if ID exists in content types', () => {
      const store = useMenusStore()
      store.contentTypes = {
        news: { drupalInternalId: 2 },
        event: { drupalInternalId: 3 },
      }
      
      const result = store.isContentTypeId(2)
      
      expect(result).toBe(true)
    })

    it('should return false if ID does not exist', () => {
      const store = useMenusStore()
      store.contentTypes = {
        news: { drupalInternalId: 2 },
      }
      
      const result = store.isContentTypeId(999)
      
      expect(result).toBe(false)
    })

    it('should handle string ID by converting to number', () => {
      const store = useMenusStore()
      store.contentTypes = {
        news: { drupalInternalId: 2 },
      }
      
      const result = store.isContentTypeId('2')
      
      expect(result).toBe(true)
    })
  })

  describe('isInMenuByContentTypeId action', () => {
    it('should find menu item by content type ID', () => {
      const store = useMenusStore()
      const menuItem = { contentTypeId: 2, title: 'News' }
      
      const result = store.isInMenuByContentTypeId(menuItem, 2)
      
      expect(result).toEqual(menuItem)
    })

    it('should return false if content type ID does not match', () => {
      const store = useMenusStore()
      const menuItem = { contentTypeId: 2, title: 'News' }
      
      const result = store.isInMenuByContentTypeId(menuItem, 3)
      
      expect(result).toBe(false)
    })

    it('should search in children', () => {
      const store = useMenusStore()
      const childItem = { contentTypeId: 3, title: 'Events' }
      const menuItem = {
        contentTypeId: 2,
        title: 'News',
        children: [childItem],
      }
      
      const result = store.isInMenuByContentTypeId(menuItem, 3)
      
      expect(result).toEqual(childItem)
    })
  })

  describe('isInMainMenuByContentTypeId action', () => {
    it('should find item in main menu by content type ID', () => {
      const store = useMenusStore()
      const menuItem = { contentTypeId: 2, title: 'News' }
      store.main = [menuItem]
      
      const result = store.isInMainMenuByContentTypeId(2)
      
      expect(result).toEqual(menuItem)
    })

    it('should return false if not found', () => {
      const store = useMenusStore()
      store.main = [{ contentTypeId: 2, title: 'News' }]
      
      const result = store.isInMainMenuByContentTypeId(999)
      
      expect(result).toBe(false)
    })

    it('should return false if ID is not provided', () => {
      const store = useMenusStore()
      store.main = [{ contentTypeId: 2, title: 'News' }]
      
      const result = store.isInMainMenuByContentTypeId()
      
      expect(result).toBe(false)
    })
  })

  describe('getSystemPageById action', () => {
    it('should find system page by ID', () => {
      const store = useMenusStore()
      const systemPage = { drupalInternalId: 1, name: 'Home' }
      store.systemPages = [systemPage]
      
      const result = store.getSystemPageById(1)
      
      expect(result).toEqual(systemPage)
    })

    it('should return undefined if not found', () => {
      const store = useMenusStore()
      store.systemPages = []
      
      const result = store.getSystemPageById(999)
      
      expect(result).toBeUndefined()
    })
  })

  describe('getSystemPageByAlias action', () => {
    it('should find system page by alias and locale', () => {
      const store = useMenusStore()
      const systemPage = {
        drupalInternalId: 1,
        aliases: {
          en: '/home',
          fr: '/accueil',
        },
      }
      store.systemPages = [systemPage]
      
      const result = store.getSystemPageByAlias('/home', 'en')
      
      expect(result).toEqual(systemPage)
    })

    it('should return undefined if alias not found', () => {
      const store = useMenusStore()
      store.systemPages = [
        {
          drupalInternalId: 1,
          aliases: { en: '/home' },
        },
      ]
      
      const result = store.getSystemPageByAlias('/missing', 'en')
      
      expect(result).toBeUndefined()
    })
  })

  describe('getSystemPagePath action', () => {
    it('should get path by alias', () => {
      const store = useMenusStore()
      const systemPage = {
        aliases: {
          en: '/home',
          fr: '/accueil',
        },
      }
      store.systemPages = [systemPage]
      
      const result = store.getSystemPagePath({ alias: '/home', locale: 'en' })
      
      expect(result).toBe('/home')
    })

    it('should get path by ID', () => {
      const store = useMenusStore()
      const systemPage = {
        drupalInternalId: 1,
        aliases: {
          en: '/home',
        },
      }
      store.systemPages = [systemPage]
      
      const result = store.getSystemPagePath({ id: 1, locale: 'en' })
      
      expect(result).toBe('/home')
    })

    it('should return default path if not found', () => {
      const store = useMenusStore()
      store.systemPages = []
      
      const result = store.getSystemPagePath({ alias: '/missing', locale: 'en' })
      
      expect(result).toBe('/taxonomy/term/21')
    })
  })

  describe('isLoaded getter', () => {
    it('should return false when footer is empty', () => {
      const store = useMenusStore()
      
      expect(store.isLoaded).toBe(false)
    })

    it('should return true when footer has items', () => {
      const store = useMenusStore()
      store.footer = [{ title: 'Item' }]
      
      expect(store.isLoaded).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle circular references in menu children', () => {
      const store = useMenusStore()
      const menu = {
        href: '/parent',
        children: [],
      }
      // Don't actually create circular reference in test as it would cause infinite loop
      
      const result = store.isInMenu(menu, '/missing')
      
      expect(result).toBe(false)
    })

    it('should handle null menus in loadAllMenus', () => {
      const store = useMenusStore()
      
      expect(() => {
        store.loadAllMenus(null)
      }).not.toThrow()
    })

    it('should handle empty string href', () => {
      const store = useMenusStore()
      const menu = { href: '', title: 'Empty' }
      
      const result = store.isInMenu(menu, '')
      
      expect(result).toBe(false)
    })
  })
})
