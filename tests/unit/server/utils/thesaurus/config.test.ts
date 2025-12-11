import { describe, it, expect } from 'vitest'
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

    it('should have URLs for API-based domains', () => {
      Object.entries(dataSourceConfigs)
        .filter(([, config]) => config.source === 'api')
        .forEach(([domain, config]) => {
          if (domain !== 'geoLocations' && domain !== 'bchSubjectGroups') {
            expect(config.url).toBeDefined()
            expect(config.url).toMatch(/^https?:\/\//)
          }
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
    it('should only include API-based domains with URLs', () => {
      apiDomains.forEach(domain => {
        const config = dataSourceConfigs[domain]
        expect(config.source).toBe('api')
        expect(config.url).toBeDefined()
      })
    })
  })

  describe('thesaurusApiUrls', () => {
    it('should map domain names to their API URLs', () => {
      expect(thesaurusApiUrls.regions).toContain('regions')
      expect(thesaurusApiUrls.countries).toContain('countries')
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
    it('should return URL for API domains', () => {
      expect(getApiUrl('regions')).toContain('regions')
      expect(getApiUrl('countries')).toContain('countries')
    })

    it('should return undefined for static domains', () => {
      expect(getApiUrl('ecosystemTypes')).toBeUndefined()
      expect(getApiUrl('documentStates')).toBeUndefined()
    })

    it('should return undefined for invalid domains', () => {
      expect(getApiUrl('invalidDomain')).toBeUndefined()
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
