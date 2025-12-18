import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'

// Mock Nuxt auto-imports
global.defineStore = defineStore
global.unref = (val) => (val && val.value !== undefined) ? val.value : val

// Mock utility functions that may be used
global.uniqueArray = (arr) => [...new Set(arr)]
global.falsyFilter = (val) => !!val

// Import store after mocking
const { useSiteStore } = await import('~/stores/site.js')

describe('useSiteStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('State Initialization', () => {
    it('should initialize with undefined values', () => {
      const store = useSiteStore()
      
      expect(store.locale).toBeUndefined()
      expect(store.identifier).toBeUndefined()
      expect(store.siteCode).toBeUndefined()
      expect(store.defaultLocale).toBeUndefined()
      expect(store.config).toBeUndefined()
    })

    it('should initialize with i18nStrategy as prefix', () => {
      const store = useSiteStore()
      expect(store.i18nStrategy).toBe('prefix')
    })
  })

  describe('set action', () => {
    it('should set a single property', () => {
      const store = useSiteStore()
      
      store.set('locale', 'en')
      
      expect(store.locale).toBe('en')
    })

    it('should return store for chaining', () => {
      const store = useSiteStore()
      
      const result = store.set('locale', 'en')
      
      expect(result).toBe(store)
    })

    it('should allow chaining multiple set calls', () => {
      const store = useSiteStore()
      
      store.set('locale', 'en')
        .set('siteCode', 'test-site')
        .set('baseHost', 'localhost')
      
      expect(store.locale).toBe('en')
      expect(store.siteCode).toBe('test-site')
      expect(store.baseHost).toBe('localhost')
    })

    it('should unref values', () => {
      const store = useSiteStore()
      
      store.set('locale', { value: 'fr' })
      
      expect(store.locale).toBe('fr')
    })
  })

  describe('initialize action', () => {
    it('should set all configuration properties', () => {
      const store = useSiteStore()
      const config = {
        locale: 'en',
        identifier: 'test-site',
        siteCode: 'test-site',
        defaultLocale: 'en',
        config: {
          defaultLocale: 'en',
          locales: ['en', 'fr'],
        },
        siteName: 'Test Site',
        gaiaApi: 'https://api.test.com',
        multiSiteCode: 'test-multi',
        baseHost: 'localhost',
        env: 'development',
      }
      
      store.initialize(config)
      
      expect(store.locale).toBe('en')
      expect(store.identifier).toBe('test-site')
      expect(store.siteCode).toBe('test-site')
      expect(store.defaultLocale).toBe('en')
      expect(store.baseHost).toBe('localhost')
      expect(store.gaiaApi).toBe('https://api.test.com')
      expect(store.multiSiteCode).toBe('test-multi')
      expect(store.name).toBe('Test Site')
    })

    it('should use identifier as siteCode if siteCode not provided', () => {
      const store = useSiteStore()
      const config = {
        locale: 'en',
        identifier: 'identifier-site',
        config: {},
        baseHost: 'localhost',
        env: 'development',
      }
      
      store.initialize(config)
      
      expect(store.identifier).toBe('identifier-site')
      expect(store.siteCode).toBe('identifier-site')
    })

    it('should use config.defaultLocale if defaultLocale not provided', () => {
      const store = useSiteStore()
      const config = {
        locale: 'en',
        siteCode: 'test',
        config: {
          defaultLocale: 'fr',
        },
        baseHost: 'localhost',
        env: 'development',
      }
      
      store.initialize(config)
      
      expect(store.defaultLocale).toBe('fr')
    })

    it('should set redirect in production env', () => {
      const store = useSiteStore()
      const config = {
        locale: 'en',
        siteCode: 'test',
        config: {
          redirect: 'www.example.com',
        },
        baseHost: 'localhost',
        env: 'production',
      }
      
      store.initialize(config)
      
      expect(store.redirect).toBe('www.example.com')
    })

    it('should not set redirect in development env', () => {
      const store = useSiteStore()
      const config = {
        locale: 'en',
        siteCode: 'test',
        config: {
          redirect: 'www.example.com',
        },
        baseHost: 'localhost',
        env: 'development',
      }
      
      store.initialize(config)
      
      expect(store.redirect).toBe('')
    })
  })

  describe('getHost action', () => {
    it('should return host with locale by default', () => {
      const store = useSiteStore()
      store.locale = 'en'
      store.siteCode = 'test-site'
      store.baseHost = 'localhost'
      store.redirect = ''
      
      const host = store.getHost()
      
      expect(host).toBe('https://test-site.localhost/en')
    })

    it('should return host without locale when ignoreLocale is true', () => {
      const store = useSiteStore()
      store.locale = 'en'
      store.siteCode = 'test-site'
      store.baseHost = 'localhost'
      store.redirect = ''
      
      const host = store.getHost(true)
      
      expect(host).toBe('https://test-site.localhost')
    })

    it('should use redirect domain when redirect is set', () => {
      const store = useSiteStore()
      store.locale = 'en'
      store.siteCode = 'test-site'
      store.baseHost = 'localhost'
      store.redirect = 'www.example.com'
      
      const host = store.getHost()
      
      expect(host).toBe('https://www.example.com/en')
    })
  })

  describe('allLocales getter', () => {
    it('should return unique list of locales', () => {
      const store = useSiteStore()
      store.config = {
        defaultLocale: 'en',
        locales: ['en', 'fr', 'es'],
      }
      
      const locales = store.allLocales
      
      expect(locales).toContain('en')
      expect(locales).toContain('fr')
      expect(locales).toContain('es')
    })

    it('should include default locale', () => {
      const store = useSiteStore()
      store.config = {
        defaultLocale: 'de',
        locales: ['en', 'fr'],
      }
      
      const locales = store.allLocales
      
      expect(locales).toContain('de')
      expect(locales).toContain('en')
      expect(locales).toContain('fr')
    })

    it('should handle missing config', () => {
      const store = useSiteStore()
      store.config = null
      
      const locales = store.allLocales
      
      expect(Array.isArray(locales)).toBe(true)
    })
  })

  describe('getLogoUri getter', () => {
    it('should return custom logo if provided', () => {
      const store = useSiteStore()
      store.config = {
        logo: 'https://example.com/logo.png',
      }
      
      expect(store.getLogoUri).toBe('https://example.com/logo.png')
    })

    it('should return country flag if country exists', () => {
      const store = useSiteStore()
      store.config = {
        country: 'us',
      }
      
      expect(store.getLogoUri).toBe('https://www.cbd.int/images/flags/96/flag-us-96.png')
    })

    it('should return country flag from countries array', () => {
      const store = useSiteStore()
      store.config = {
        countries: ['ca', 'mx'],
      }
      
      expect(store.getLogoUri).toBe('https://www.cbd.int/images/flags/96/flag-ca-96.png')
    })

    it('should return default flag if no logo or country', () => {
      const store = useSiteStore()
      store.config = {}
      
      expect(store.getLogoUri).toBe('https://seed.chm-cbd.net/sites/default/files/images/country/flag/xx.png')
    })

    it('should prioritize logo over country', () => {
      const store = useSiteStore()
      store.config = {
        logo: 'https://example.com/logo.png',
        country: 'us',
      }
      
      expect(store.getLogoUri).toBe('https://example.com/logo.png')
    })
  })

  describe('host getter', () => {
    it('should return host without locale', () => {
      const store = useSiteStore()
      store.locale = 'en'
      store.siteCode = 'test-site'
      store.baseHost = 'localhost'
      store.redirect = ''
      
      expect(store.host).toBe('https://test-site.localhost')
    })
  })

  describe('localizedHost getter', () => {
    it('should return host with locale', () => {
      const store = useSiteStore()
      store.locale = 'fr'
      store.siteCode = 'test-site'
      store.baseHost = 'localhost'
      store.redirect = ''
      
      expect(store.localizedHost).toBe('https://test-site.localhost/fr')
    })
  })

  describe('params getter', () => {
    it('should return all configuration parameters', () => {
      const store = useSiteStore()
      store.i18nStrategy = 'prefix'
      store.identifier = 'test-site'
      store.baseHost = 'localhost'
      store.siteCode = 'test-site'
      store.locale = 'en'
      store.defaultLocale = 'en'
      store.redirect = ''
      store.config = {
        country: 'us',
        countries: [],
        locales: ['en', 'fr'],
        defaultLocale: 'en',
      }
      
      const params = store.params
      
      expect(params.i18nStrategy).toBe('prefix')
      expect(params.identifier).toBe('test-site')
      expect(params.baseHost).toBe('localhost')
      expect(params.siteCode).toBe('test-site')
      expect(params.locale).toBe('en')
      expect(params.defaultLocale).toBe('en')
      expect(params.country).toBe('us')
      expect(Array.isArray(params.locales)).toBe(true)
      expect(Array.isArray(params.countries)).toBe(true)
    })
  })

  describe('countries getter', () => {
    it('should return countries from config.countries', () => {
      const store = useSiteStore()
      store.config = {
        countries: ['us', 'ca', 'mx'],
      }
      
      expect(store.countries).toEqual(['us', 'ca', 'mx'])
    })

    it('should return country from config.country', () => {
      const store = useSiteStore()
      store.config = {
        country: 'us',
      }
      
      expect(store.countries).toContain('us')
    })

    it('should combine country and countries', () => {
      const store = useSiteStore()
      store.config = {
        country: 'us',
        countries: ['ca', 'mx'],
      }
      
      const countries = store.countries
      expect(countries).toContain('us')
      expect(countries).toContain('ca')
      expect(countries).toContain('mx')
    })

    it('should return countries from runtime config', () => {
      const store = useSiteStore()
      store.config = {
        runtime: {
          countries: ['fr', 'de'],
        },
      }
      
      expect(store.countries).toEqual(['fr', 'de'])
    })
  })

  describe('primaryColor getter', () => {
    it('should return primary color from config', () => {
      const store = useSiteStore()
      store.config = {
        theme: {
          color: {
            primary: '#ff0000',
          },
        },
      }
      
      expect(store.primaryColor).toBe('#ff0000')
    })

    it('should return default color if not set', () => {
      const store = useSiteStore()
      store.config = {}
      
      expect(store.primaryColor).toBe('#009edb')
    })

    it('should return primary color from runtime config', () => {
      const store = useSiteStore()
      store.config = {
        runTime: {
          theme: {
            color: {
              primary: '#00ff00',
            },
          },
        },
      }
      
      expect(store.primaryColor).toBe('#00ff00')
    })
  })

  describe('secondaryColor getter', () => {
    it('should return secondary color from config', () => {
      const store = useSiteStore()
      store.config = {
        theme: {
          color: {
            secondary: '#00ff00',
          },
        },
      }
      
      expect(store.secondaryColor).toBe('#00ff00')
    })

    it('should return undefined if not set', () => {
      const store = useSiteStore()
      store.config = {}
      
      expect(store.secondaryColor).toBeUndefined()
    })
  })

  describe('theme getter', () => {
    it('should return theme object from config', () => {
      const store = useSiteStore()
      store.config = {
        theme: {
          color: {
            primary: '#ff0000',
          },
        },
      }
      
      expect(store.theme).toEqual({
        color: {
          primary: '#ff0000',
        },
      })
    })

    it('should return empty object if no theme', () => {
      const store = useSiteStore()
      store.config = {}
      
      expect(store.theme).toEqual({})
    })

    it('should return theme from runtime config', () => {
      const store = useSiteStore()
      store.config = {
        runTime: {
          theme: {
            color: {
              primary: '#00ff00',
            },
          },
        },
      }
      
      expect(store.theme).toEqual({
        color: {
          primary: '#00ff00',
        },
      })
    })
  })

  describe('maxLangBeforeWrap getter', () => {
    it('should return maxLangBeforeWrap from config', () => {
      const store = useSiteStore()
      store.config = {
        theme: {
          i18n: {
            maxLangBeforeWrap: 5,
          },
        },
      }
      
      expect(store.maxLangBeforeWrap).toBe(5)
    })

    it('should return undefined if not set', () => {
      const store = useSiteStore()
      store.config = {}
      
      expect(store.maxLangBeforeWrap).toBeUndefined()
    })

    it('should return maxLangBeforeWrap from runtime config', () => {
      const store = useSiteStore()
      store.config = {
        runTime: {
          theme: {
            i18n: {
              maxLangBeforeWrap: 3,
            },
          },
        },
      }
      
      expect(store.maxLangBeforeWrap).toBe(3)
    })
  })

  describe('Edge Cases', () => {
    it('should handle null config', () => {
      const store = useSiteStore()
      store.config = null
      
      expect(store.countries).toEqual([])
      expect(store.theme).toEqual({})
    })

    it('should encode special characters in URL', () => {
      const store = useSiteStore()
      store.locale = 'en'
      store.siteCode = 'test site'
      store.baseHost = 'local host'
      store.redirect = ''
      
      const host = store.getHost()
      
      expect(host).toContain('test%20site')
      expect(host).toContain('local%20host')
    })
  })
})
