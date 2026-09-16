import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  dataSourceConfigs,
  dataSources,
  searchableDomains,
  apiDomains,
  thesaurusApiUrls,
  isValidDomain,
  getApiUrl,
  getSanitizerConfig
} from '~/server/utils/thesaurus/config'

const PROD_GAIA_API_BASE = 'https://api.cbd.int/api/v2013/thesaurus/domains'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('thesaurus/config', () => {
  describe('dataSourceConfigs', () => {
    it('should contain expected domain keys', () => {
      expect(dataSourceConfigs).toHaveProperty('regions')
      expect(dataSourceConfigs).toHaveProperty('countries')
      expect(dataSourceConfigs).toHaveProperty('orgTypes')
      expect(dataSourceConfigs).toHaveProperty('gbfTargets')
      expect(dataSourceConfigs).toHaveProperty('ecosystemTypes')
    })

    it('should have valid source types for all configs', () => {
      Object.entries(dataSourceConfigs).forEach(([domain, config]) => {
        expect(['api', 'static']).toContain(config.source)
        expect(config.sanitizer).toBeDefined()
        expect(config.sanitizer.type).toBeDefined()
      })
    })

    it('should have a path for API-based, gaiaApi-relative domains', () => {
      Object.entries(dataSourceConfigs)
        .filter(([, config]) => config.source === 'api')
        .forEach(([, config]) => {
          expect(config.path).toBeDefined()
        })
    })

    it('should not embed a hardcoded API base in gaiaApi-relative domain paths', () => {
      const externalDomains = new Set(['sdgs', 'sdts'])
      Object.entries(dataSourceConfigs)
        .filter(([domain, config]) => config.source === 'api' && !externalDomains.has(domain))
        .forEach(([, config]) => {
          expect(config.path).not.toMatch(/^https?:\/\//)
        })
    })
  })

  describe('dataSources', () => {
    it('should be an array of domain names', () => {
      expect(Array.isArray(dataSources)).toBe(true)
      expect(dataSources.length).toBeGreaterThan(0)
      expect(dataSources).toContain('regions')
      expect(dataSources).toContain('countries')
    })

    it('should match keys in dataSourceConfigs', () => {
      const configKeys = Object.keys(dataSourceConfigs)
      expect(dataSources).toEqual(configKeys)
    })
  })

  describe('searchableDomains', () => {
    it('should only include domains with searchable: true', () => {
      searchableDomains.forEach(domain => {
        expect(dataSourceConfigs[domain].searchable).toBe(true)
      })
    })

    it('should not include non-searchable domains', () => {
      expect(searchableDomains).not.toContain('geoLocations')
      expect(searchableDomains).not.toContain('bchSubjectGroups')
    })
  })

  describe('apiDomains', () => {
    it('should only include API-based domains with a path', () => {
      apiDomains.forEach(domain => {
        const config = dataSourceConfigs[domain]
        expect(config.source).toBe('api')
        expect(config.path).toBeDefined()
      })
    })
  })

  describe('thesaurusApiUrls', () => {
    it('should map domain names to their default (production) API URLs', () => {
      expect(thesaurusApiUrls.regions).toBe(`${PROD_GAIA_API_BASE}/regions/terms`)
      expect(thesaurusApiUrls.countries).toBe(`${PROD_GAIA_API_BASE}/countries/terms`)
    })

    it('should leave external API URLs untouched', () => {
      expect(thesaurusApiUrls.sdgs).toBe('https://unstats.un.org/SDGAPI/v1/sdg/Goal/List?includechildren=false')
    })
  })

  describe('isValidDomain', () => {
    it('should return true for valid domains', () => {
      expect(isValidDomain('regions')).toBe(true)
      expect(isValidDomain('countries')).toBe(true)
      expect(isValidDomain('ecosystemTypes')).toBe(true)
    })

    it('should return false for invalid domains', () => {
      expect(isValidDomain('invalidDomain')).toBe(false)
      expect(isValidDomain('')).toBe(false)
      expect(isValidDomain('REGIONS')).toBe(false)
    })
  })

  describe('getApiUrl', () => {
    it('should return undefined for static domains', () => {
      expect(getApiUrl('ecosystemTypes')).toBeUndefined()
      expect(getApiUrl('documentStates')).toBeUndefined()
    })

    it('should return undefined for invalid domains', () => {
      expect(getApiUrl('invalidDomain')).toBeUndefined()
    })

    it('should return an absolute URL unchanged for external (non-gaiaApi) domains', () => {
      expect(getApiUrl('sdgs')).toBe('https://unstats.un.org/SDGAPI/v1/sdg/Goal/List?includechildren=false')
      expect(getApiUrl('sdts')).toBe('https://unstats.un.org/SDGAPI/v1/sdg/Target/List?includechildren=false')
    })

    it('should fall back to the documented production default when runtime config is unavailable', () => {
      // No `useRuntimeConfig` global is stubbed in this test — mirrors calling getApiUrl
      // outside a request/Nitro context (e.g. module import, plain unit test).
      expect(getApiUrl('regions')).toBe(`${PROD_GAIA_API_BASE}/regions/terms`)
    })

    it('should return the production URL for every gaiaApi domain when gaiaApi is at its default', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ public: { gaiaApi: 'https://api.cbd.int/api' } }))

      Object.entries(dataSourceConfigs)
        .filter(([domain, config]) => config.source === 'api' && !['sdgs', 'sdts'].includes(domain))
        .forEach(([domain, config]) => {
          const url = getApiUrl(domain)!
          expect(url).toBe(`${PROD_GAIA_API_BASE}/${config.path}`)
          // No doubled or missing slash at the join point (ignoring the protocol's `//`).
          expect(url.replace(/^https?:\/\//, '')).not.toMatch(/\/\//)
          expect(url.split('/domains/')[1]).toBe(config.path)
        })
    })

    it('should return the overridden host when gaiaApi is stubbed to a non-prod value', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ public: { gaiaApi: 'https://staging.api.cbd.int/api' } }))

      expect(getApiUrl('regions')).toBe('https://staging.api.cbd.int/api/v2013/thesaurus/domains/regions/terms')
      expect(getApiUrl('countries')).toBe('https://staging.api.cbd.int/api/v2013/thesaurus/domains/countries/terms')
    })

    it('should preserve URL-encoded paths byte-for-byte (orgTypes/govTypes share one endpoint)', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ public: { gaiaApi: 'https://api.cbd.int/api' } }))

      expect(getApiUrl('orgTypes')).toBe(`${PROD_GAIA_API_BASE}/Organization%20Types/terms`)
      expect(getApiUrl('govTypes')).toBe(`${PROD_GAIA_API_BASE}/Organization%20Types/terms`)
    })

    it('should fall back to the documented default when gaiaApi is missing from runtime config', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
      expect(getApiUrl('regions')).toBe(`${PROD_GAIA_API_BASE}/regions/terms`)
    })
  })

  describe('getSanitizerConfig', () => {
    it('should return sanitizer config for valid domains', () => {
      const regionsConfig = getSanitizerConfig('regions')
      expect(regionsConfig).toBeDefined()
      expect(regionsConfig?.type).toBe('AdministrativeArea')

      const countriesConfig = getSanitizerConfig('countries')
      expect(countriesConfig).toBeDefined()
      expect(countriesConfig?.type).toBe('Country')
    })

    it('should return undefined for invalid domains', () => {
      expect(getSanitizerConfig('invalidDomain')).toBeUndefined()
    })

    it('should include transform function for domains that need it', () => {
      const countriesConfig = getSanitizerConfig('countries')
      expect(countriesConfig?.transform).toBeDefined()
      expect(typeof countriesConfig?.transform).toBe('function')
    })

    it('should include filter function for filtered domains', () => {
      const orgTypesConfig = getSanitizerConfig('orgTypes')
      expect(orgTypesConfig?.filter).toBeDefined()
      expect(typeof orgTypesConfig?.filter).toBe('function')
    })
  })

  describe('filter functions', () => {
    it('orgTypes filter should exclude government types', () => {
      const config = getSanitizerConfig('orgTypes')
      const govTypeId = '9456EBD7-5DDD-4423-82BD-B117D109667C'
      const orgTypeId = 'SOME-OTHER-ID'

      expect(config?.filter?.({ identifier: govTypeId })).toBe(false)
      expect(config?.filter?.({ identifier: orgTypeId })).toBe(true)
    })

    it('govTypes filter should include only government types', () => {
      const config = getSanitizerConfig('govTypes')
      const govTypeId = '9456EBD7-5DDD-4423-82BD-B117D109667C'
      const orgTypeId = 'SOME-OTHER-ID'

      expect(config?.filter?.({ identifier: govTypeId })).toBe(true)
      expect(config?.filter?.({ identifier: orgTypeId })).toBe(false)
    })
  })

  describe('transform functions', () => {
    it('countries transform should add image and url', () => {
      const config = getSanitizerConfig('countries')
      const result = config?.transform?.({ identifier: 'CA' }, 'en')

      expect(result?.image).toBe('https://flagcdn.com/ca.svg')
      expect(result?.url).toBe('https://www.cbd.int/countries/ca')
    })

    it('aichis transform should add image and url for valid targets', () => {
      const config = getSanitizerConfig('aichis')
      const result = config?.transform?.({ identifier: 'AICHI-TARGET-05' }, 'en')

      expect(result?.image).toMatch(/\/images\/aichi\/aichi-0?5\.svg/)
      expect(result?.url).toMatch(/aichi-targets\/target\/5/)
    })

    it('gbfTargets transform should add image and url', () => {
      const config = getSanitizerConfig('gbfTargets')
      const result = config?.transform?.({ identifier: 'GBF-TARGET-03' }, 'en')

      expect(result?.image).toMatch(/\/images\/gbf\/gbf-target-0?3\.svg/)
      expect(result?.url).toMatch(/gbf\/targets\/3/)
    })

    it('sdgs transform should format SDG data correctly', () => {
      const config = getSanitizerConfig('sdgs')
      const result = config?.transform?.({ code: 1, title: 'No Poverty' }, 'en')

      expect(result?.identifier).toBe('SDG-GOAL-01')
      expect(result?.name).toBe('1. No Poverty')
      expect(result?.image).toBe('/images/sdg/sdg-01.svg')
      expect(result?.url).toBe('https://sustainabledevelopment.un.org/sdg1')
    })
  })
})
