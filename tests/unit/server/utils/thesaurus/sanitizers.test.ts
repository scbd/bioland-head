import { describe, it, expect } from 'vitest'
import type { ThesaurusItem, LString } from '~/shared/types'
import { getLocalizedName, createSanitizer, getSanitizer, sanitizeItems } from '~/server/utils/thesaurus/sanitizers'

/**
 * Live-probe-shaped fixtures (BL-970 / p01-01). These mirror the four real
 * response shapes the CBD thesaurus API returns, verified against
 * `temp/research/api-probes/*.json`:
 *  1. full six-language coverage
 *  2. partial coverage (en/es/fr only)
 *  3. English-only
 *  4. an empty `shortTitle: {}` object
 */
const fullCoverageTerm: ThesaurusItem = {
  identifier: 'CCA4B662-0000-0000-0000-000000000000',
  name: 'Access and Benefit-sharing',
  title: { en: 'Access and Benefit-sharing', es: 'Acceso y participación en los beneficios', fr: 'Accès et partage des avantages', ar: 'الوصول وتقاسم المنافع', ru: 'Доступ и совместное использование выгод', zh: '获取和惠益分享' },
  shortTitle: { en: 'ABS', es: 'APB', fr: 'APA', ar: 'ABS', ru: 'ABS', zh: 'ABS' }
}

const partialCoverageTerm: ThesaurusItem = {
  identifier: 'GBF-TARGET-01',
  name: 'Plan and Manage All Areas To Reduce Biodiversity Loss',
  title: { en: 'Plan and Manage All Areas To Reduce Biodiversity Loss', es: 'Planificar y gestionar todas las áreas para reducir la pérdida de biodiversidad', fr: 'Planifier et gérer toutes les zones pour réduire la perte de biodiversité' }
}

const englishOnlyTerm: ThesaurusItem = {
  identifier: 'GBF-GOAL-A',
  name: 'Goal A',
  title: { en: 'Goal A' }
}

const emptyShortTitleTerm: ThesaurusItem = {
  identifier: 'CBD-SUBJECT-BIOMES',
  name: 'Biomes',
  title: { en: 'Biomes' },
  shortTitle: {} as LString
}

describe('thesaurus/sanitizers', () => {
  describe('getLocalizedName', () => {
    it('returns undefined for undefined input', () => {
      expect(getLocalizedName(undefined)).toBeUndefined()
    })

    it('returns a plain string unchanged, locale ignored (the guard other callers rely on)', () => {
      expect(getLocalizedName('plain string', 'fr')).toBe('plain string')
    })

    it('returns the requested locale from an LString', () => {
      const lstring: LString = { en: 'English', fr: 'French', es: 'Spanish' }
      expect(getLocalizedName(lstring, 'fr')).toBe('French')
      expect(getLocalizedName(lstring, 'es')).toBe('Spanish')
    })

    it('falls back to English when the requested locale is missing', () => {
      const lstring: LString = { en: 'English', fr: 'French' }
      expect(getLocalizedName(lstring, 'de')).toBe('English')
    })

    it('falls back to the first value when neither the locale nor English is present', () => {
      const lstring = { fr: 'French', es: 'Spanish' } as LString
      expect(getLocalizedName(lstring, 'de')).toBe('French')
    })

    it('defaults to English when no locale is specified', () => {
      const lstring: LString = { en: 'English', fr: 'French' }
      expect(getLocalizedName(lstring)).toBe('English')
    })

    it('returns undefined for an empty LString object rather than leaking undefined into a truthy chain', () => {
      expect(getLocalizedName({} as LString, 'en')).toBeUndefined()
    })
  })

  describe('createSanitizer field ordering (shortTitle -> title -> name)', () => {
    it('prefers shortTitle for name, and title (not shortTitle) for alternateName — full coverage', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer(fullCoverageTerm, 'fr')

      expect(result?.name).toBe('APA')
      expect(result?.alternateName).toBe('Accès et partage des avantages')
    })

    it('falls back to title when locale is missing from shortTitle-less/partial data', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer(partialCoverageTerm, 'fr')

      expect(result?.name).toBe('Planifier et gérer toutes les zones pour réduire la perte de biodiversité')
      expect(result?.alternateName).toBe(result?.name)
    })

    it('falls back to English when the requested locale does not exist on the term at all', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer(partialCoverageTerm, 'ar')

      expect(result?.name).toBe('Plan and Manage All Areas To Reduce Biodiversity Loss')
    })

    it('resolves to the single available language for an English-only term', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer(englishOnlyTerm, 'fr')

      expect(result?.name).toBe('Goal A')
      expect(result?.name).not.toBeUndefined()
    })

    it('falls through past an empty shortTitle object to title, never leaking undefined', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer(emptyShortTitleTerm, 'en')

      expect(result?.name).toBe('Biomes')
      expect(result?.name).not.toBeUndefined()
    })

    it('falls all the way back to plain-English name when neither shortTitle nor title carry data', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer({ identifier: 'NO-TITLE', name: 'Plain English Only' }, 'fr')

      expect(result?.name).toBe('Plain English Only')
    })
  })

  describe('createSanitizer', () => {
    it('creates a sanitizer function', () => {
      expect(typeof createSanitizer({ type: 'Thing' })).toBe('function')
    })

    it('returns null for items without an identifier or code', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      expect(sanitizer({})).toBeNull()
      expect(sanitizer({ name: 'Test' })).toBeNull()
    })

    it('uses code as identifier when identifier is missing', () => {
      const sanitizer = createSanitizer({ type: 'Project' })
      const result = sanitizer({ code: '01', name: 'SDG Goal 1' })
      expect(result).not.toBeNull()
      expect(result?.identifier).toBe('')
    })

    it('applies a filter and returns null when filtered out', () => {
      const sanitizer = createSanitizer({ type: 'Thing', filter: (item) => item.identifier !== 'EXCLUDED' })
      expect(sanitizer({ identifier: 'INCLUDED' })).not.toBeNull()
      expect(sanitizer({ identifier: 'EXCLUDED' })).toBeNull()
    })

    it('applies a transform function on top of the localized fields', () => {
      const sanitizer = createSanitizer({
        type: 'Project',
        transform: (item) => ({ image: `/images/${item.identifier}.svg`, url: `https://example.com/${item.identifier}` })
      })
      const result = sanitizer({ identifier: 'test-id', name: 'Test' })
      expect(result?.image).toBe('/images/test-id.svg')
      expect(result?.url).toBe('https://example.com/test-id')
    })

    it('carries narrowerTerms through untouched', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer({ identifier: 'PARENT', name: 'Parent Term', narrowerTerms: ['CHILD1', 'CHILD2'] })
      expect(result?.narrowerTerms).toEqual(['CHILD1', 'CHILD2'])
    })

    it('omits undefined/null values from the result', () => {
      const sanitizer = createSanitizer({ type: 'Thing' })
      const result = sanitizer({ identifier: 'TEST', name: 'Test' })
      expect(result).not.toHaveProperty('description')
      expect(result).not.toHaveProperty('alternateName')
      expect(result).not.toHaveProperty('narrowerTerms')
    })
  })

  describe('getSanitizer', () => {
    it('returns a sanitizer for a known domain', () => {
      expect(typeof getSanitizer('regions')).toBe('function')
      expect(typeof getSanitizer('countries')).toBe('function')
    })

    it('returns a default Thing sanitizer for an unknown domain', () => {
      const sanitizer = getSanitizer('unknownDomain')
      const result = sanitizer({ identifier: 'TEST', name: 'Test' })
      expect(result?.['@type']).toBe('Thing')
    })
  })

  describe('sanitizeItems', () => {
    it('sanitizes an array of items', () => {
      const items: ThesaurusItem[] = [
        { identifier: 'A', name: 'Item A' },
        { identifier: 'B', name: 'Item B' }
      ]
      const result = sanitizeItems(items, 'regions', 'en')
      expect(result).toHaveLength(2)
      expect(result[0].identifier).toBe('A')
    })

    it('filters out null results (items with no identifier)', () => {
      const items: ThesaurusItem[] = [
        { identifier: 'VALID', name: 'Valid' },
        { name: 'No ID' } as ThesaurusItem
      ]
      const result = sanitizeItems(items, 'regions', 'en')
      expect(result).toHaveLength(1)
    })

    it('respects the locale parameter across the array', () => {
      const items: ThesaurusItem[] = [fullCoverageTerm]
      const enResult = sanitizeItems(items, 'unknownDomain', 'en')
      const zhResult = sanitizeItems(items, 'unknownDomain', 'zh')
      expect(enResult[0].name).toBe('ABS')
      expect(zhResult[0].name).toBe('ABS')
      expect(zhResult[0].alternateName).toBe('获取和惠益分享')
    })

    it('returns an empty array for an empty input', () => {
      expect(sanitizeItems([], 'regions', 'en')).toEqual([])
    })
  })
})
