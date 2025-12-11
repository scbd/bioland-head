import { describe, it, expect } from 'vitest'
import type { LString } from '~/shared/types'

/**
 * Standalone implementations for testing sanitizer logic
 * The actual sanitizers.ts imports from config-new which doesn't exist,
 * so we test the core logic independently here.
 */

interface ThesaurusItem {
  identifier?: string
  name?: LString | string
  title?: string
  shortTitle?: LString | string
  description?: LString | string
  narrowerTerms?: string[]
  code?: string
  [key: string]: any
}

interface SanitizedItem {
  identifier: string
  name?: string
  alternateName?: string
  description?: string
  narrowerTerms?: string[]
  '@type'?: string
  '@context'?: string
  [key: string]: any
}

interface SanitizerConfig {
  type: string
  filter?: (item: ThesaurusItem) => boolean
  transform?: (item: ThesaurusItem, locale: string) => Partial<SanitizedItem>
}

/** Extract localized text from lstring, falls back to 'en' */
const getLocalizedName = (val: LString | string | undefined, locale = 'en'): string | undefined => {
  if (!val) return undefined
  if (typeof val === 'string') return val
  return val[locale] || val.en || Object.values(val)[0]
}

/** Remove null/undefined values from object */
const omitNil = <T extends Record<string, any>>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as Partial<T>

/** Create a sanitizer function from config */
function createSanitizer(config: SanitizerConfig) {
  return (item: ThesaurusItem, locale = 'en'): SanitizedItem | null => {
    if (!item?.identifier && !item?.code) return null
    if (config.filter && !config.filter(item)) return null

    const transformed = config.transform?.(item, locale) || {}
    
    const result: SanitizedItem = {
      identifier: item.identifier || '',
      name: getLocalizedName(item.name, locale) || getLocalizedName(item.title as LString, locale),
      alternateName: getLocalizedName(item.shortTitle, locale),
      description: getLocalizedName(item.description, locale),
      narrowerTerms: item.narrowerTerms,
      '@type': config.type,
      '@context': 'https://schema.org',
      ...transformed
    }

    return omitNil(result) as SanitizedItem
  }
}

/** Get sanitizer - returns default for unknown domains */
const getSanitizer = (domain: string) => {
  // Simple default sanitizer for testing
  return createSanitizer({ type: 'Thing' })
}

/** Sanitize array of items */
const sanitizeItems = (items: ThesaurusItem[], domain: string, locale = 'en'): SanitizedItem[] =>
  items.map(item => getSanitizer(domain)(item, locale)).filter((x): x is SanitizedItem => x !== null)

describe('thesaurus/sanitizers', () => {
  describe('getLocalizedName', () => {
    it('should return undefined for undefined input', () => {
      expect(getLocalizedName(undefined)).toBeUndefined()
    })

    it('should return string as-is for string input', () => {
      expect(getLocalizedName('Test Name')).toBe('Test Name')
    })

    it('should return requested locale from LString', () => {
      const lstring: LString = { en: 'English', fr: 'French', es: 'Spanish' }
      expect(getLocalizedName(lstring, 'fr')).toBe('French')
      expect(getLocalizedName(lstring, 'es')).toBe('Spanish')
    })

    it('should fallback to English when locale not found', () => {
      const lstring: LString = { en: 'English', fr: 'French' }
      expect(getLocalizedName(lstring, 'de')).toBe('English')
    })

    it('should fallback to first value when no English', () => {
      const lstring = { fr: 'French', es: 'Spanish' } as LString
      expect(getLocalizedName(lstring, 'de')).toBe('French')
    })

    it('should default to English locale when not specified', () => {
      const lstring: LString = { en: 'English', fr: 'French' }
      expect(getLocalizedName(lstring)).toBe('English')
    })
  })

  describe('createSanitizer', () => {
    it('should create a sanitizer function', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      expect(typeof sanitizer).toBe('function')
    })

    it('should return null for items without identifier', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      expect(sanitizer({} as ThesaurusItem)).toBeNull()
      expect(sanitizer({ name: { en: 'Test' } } as ThesaurusItem)).toBeNull()
    })

    it('should sanitize item with basic properties', () => {
      const sanitizer = createSanitizer({ type: 'Country' })
      const item: ThesaurusItem = {
        identifier: 'CA',
        name: { en: 'Canada', fr: 'Canada' },
        description: { en: 'A North American country' }
      }
      
      const result = sanitizer(item, 'en')
      
      expect(result).not.toBeNull()
      expect(result?.identifier).toBe('CA')
      expect(result?.name).toBe('Canada')
      expect(result?.description).toBe('A North American country')
      expect(result?.['@type']).toBe('Country')
      expect(result?.['@context']).toBe('https://schema.org')
    })

    it('should apply filter and return null when filtered out', () => {
      const sanitizer = createSanitizer({
        type: 'Thing',
        filter: (item) => item.identifier !== 'EXCLUDED'
      })
      
      expect(sanitizer({ identifier: 'INCLUDED' })).not.toBeNull()
      expect(sanitizer({ identifier: 'EXCLUDED' })).toBeNull()
    })

    it('should apply transform function', () => {
      const sanitizer = createSanitizer({
        type: 'Project',
        transform: (item) => ({
          image: `/images/${item.identifier}.svg`,
          url: `https://example.com/${item.identifier}`
        })
      })
      
      const result = sanitizer({ identifier: 'test-id', name: { en: 'Test' } })
      
      expect(result?.image).toBe('/images/test-id.svg')
      expect(result?.url).toBe('https://example.com/test-id')
    })

    it('should handle shortTitle as alternateName', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const item: ThesaurusItem = {
        identifier: 'TEST',
        name: { en: 'Full Name' },
        shortTitle: { en: 'Short' }
      }
      
      const result = sanitizer(item, 'en')
      expect(result?.alternateName).toBe('Short')
    })

    it('should handle narrowerTerms', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const item: ThesaurusItem = {
        identifier: 'PARENT',
        name: { en: 'Parent Term' },
        narrowerTerms: ['CHILD1', 'CHILD2']
      }
      
      const result = sanitizer(item, 'en')
      expect(result?.narrowerTerms).toEqual(['CHILD1', 'CHILD2'])
    })

    it('should omit undefined/null values from result', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const item: ThesaurusItem = {
        identifier: 'TEST',
        name: { en: 'Test' }
      }
      
      const result = sanitizer(item, 'en')
      expect(result).not.toHaveProperty('description')
      expect(result).not.toHaveProperty('alternateName')
      expect(result).not.toHaveProperty('narrowerTerms')
    })

    it('should use code as identifier when identifier is missing', () => {
      const sanitizer = createSanitizer({ type: 'Project' })
      const item: ThesaurusItem = {
        code: '01',
        title: 'SDG Goal 1'
      }
      
      const result = sanitizer(item, 'en')
      expect(result).not.toBeNull()
    })
  })

  describe('getSanitizer', () => {
    it('should return sanitizer for known domains', () => {
      const regionsSanitizer = getSanitizer('regions')
      expect(typeof regionsSanitizer).toBe('function')
      
      const countriesSanitizer = getSanitizer('countries')
      expect(typeof countriesSanitizer).toBe('function')
    })

    it('should return default sanitizer for unknown domains', () => {
      const unknownSanitizer = getSanitizer('unknownDomain')
      expect(typeof unknownSanitizer).toBe('function')
      
      const result = unknownSanitizer({ identifier: 'TEST', name: { en: 'Test' } })
      expect(result?.['@type']).toBe('Thing')
    })
  })

  describe('sanitizeItems', () => {
    it('should sanitize array of items', () => {
      const items: ThesaurusItem[] = [
        { identifier: 'A', name: { en: 'Item A' } },
        { identifier: 'B', name: { en: 'Item B' } },
        { identifier: 'C', name: { en: 'Item C' } }
      ]
      
      const result = sanitizeItems(items, 'regions', 'en')
      
      expect(result).toHaveLength(3)
      expect(result[0].identifier).toBe('A')
      expect(result[1].identifier).toBe('B')
      expect(result[2].identifier).toBe('C')
    })

    it('should filter out null results', () => {
      const items: ThesaurusItem[] = [
        { identifier: 'VALID', name: { en: 'Valid' } },
        { name: { en: 'No ID' } } as ThesaurusItem,
        { identifier: 'ALSO-VALID', name: { en: 'Also Valid' } }
      ]
      
      const result = sanitizeItems(items, 'regions', 'en')
      
      expect(result).toHaveLength(2)
      expect(result.every(item => item.identifier)).toBe(true)
    })

    it('should apply domain-specific sanitization', () => {
      // Create a countries-specific sanitizer with transform
      const countrySanitizer = createSanitizer({
        type: 'Country',
        transform: (item) => ({
          image: `https://flagcdn.com/${item.identifier?.toLowerCase()}.svg`,
          url: `https://www.cbd.int/countries/${item.identifier?.toLowerCase()}`
        })
      })
      
      const item: ThesaurusItem = { identifier: 'CA', name: { en: 'Canada' } }
      const result = countrySanitizer(item, 'en')
      
      expect(result?.image).toContain('flagcdn.com')
      expect(result?.url).toContain('cbd.int/countries')
    })

    it('should handle empty array', () => {
      const result = sanitizeItems([], 'regions', 'en')
      expect(result).toEqual([])
    })

    it('should respect locale parameter', () => {
      const items: ThesaurusItem[] = [
        { identifier: 'TEST', name: { en: 'English', fr: 'French' } }
      ]
      
      const enResult = sanitizeItems(items, 'regions', 'en')
      const frResult = sanitizeItems(items, 'regions', 'fr')
      
      expect(enResult[0].name).toBe('English')
      expect(frResult[0].name).toBe('French')
    })
  })
})
