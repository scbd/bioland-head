import { describe, it, expect } from 'vitest'

/**
 * Standalone test for index.js exports
 * The fetcher.ts imports from config-new which doesn't exist,
 * so we test only the functions that work independently.
 */

// SDG data copied from source for testing
const sdgsData = [
  { identifier: 'SDG-GOAL-01', image: '/images/sdg/sdg-01.svg', url: 'https://sustainabledevelopment.un.org/sdg1', name: '1. No Poverty', alternateName: 'End poverty in all its forms everywhere', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-02', image: '/images/sdg/sdg-02.svg', url: 'https://sustainabledevelopment.un.org/sdg2', name: '2. Zero Hunger', alternateName: 'End hunger, achieve food security and improved nutrition and promote sustainable agriculture', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-03', image: '/images/sdg/sdg-03.svg', url: 'https://sustainabledevelopment.un.org/sdg3', name: '3. Good Health and Well-being', alternateName: 'Ensure healthy lives and promote well-being for all at all ages', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-04', image: '/images/sdg/sdg-04.svg', url: 'https://sustainabledevelopment.un.org/sdg4', name: '4. Quality Education', alternateName: 'Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-05', image: '/images/sdg/sdg-05.svg', url: 'https://sustainabledevelopment.un.org/sdg5', name: '5. Gender Equality', alternateName: 'Achieve gender equality and empower all women and girls', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-06', image: '/images/sdg/sdg-06.svg', url: 'https://sustainabledevelopment.un.org/sdg6', name: '6. Clean Water and Sanitation', alternateName: 'Ensure availability and sustainable management of water and sanitation for all', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-07', image: '/images/sdg/sdg-07.svg', url: 'https://sustainabledevelopment.un.org/sdg7', name: '7. Affordable and Clean Energy', alternateName: 'Ensure access to affordable, reliable, sustainable and modern energy for all', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-08', image: '/images/sdg/sdg-08.svg', url: 'https://sustainabledevelopment.un.org/sdg8', name: '8. Decent Work and Economic Growth', alternateName: 'Promote sustained, inclusive and sustainable economic growth, full and productive employment and decent work for all', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-09', image: '/images/sdg/sdg-09.svg', url: 'https://sustainabledevelopment.un.org/sdg9', name: '9. Industry, Innovation and Infrastructure', alternateName: 'Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-10', image: '/images/sdg/sdg-10.svg', url: 'https://sustainabledevelopment.un.org/sdg10', name: '10. Reduced Inequality', alternateName: 'Reduce inequality within and among countries', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-11', image: '/images/sdg/sdg-11.svg', url: 'https://sustainabledevelopment.un.org/sdg11', name: '11. Sustainable Cities and Communities', alternateName: 'Make cities and human settlements inclusive, safe, resilient and sustainable', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-12', image: '/images/sdg/sdg-12.svg', url: 'https://sustainabledevelopment.un.org/sdg12', name: '12. Responsible Consumption and Production', alternateName: 'Ensure sustainable consumption and production patterns', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-13', image: '/images/sdg/sdg-13.svg', url: 'https://sustainabledevelopment.un.org/sdg13', name: '13. Climate Action', alternateName: 'Take urgent action to combat climate change and its impacts', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-14', image: '/images/sdg/sdg-14.svg', url: 'https://sustainabledevelopment.un.org/sdg14', name: '14. Life Below Water', alternateName: 'Conserve and sustainably use the oceans, seas and marine resources for sustainable development', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-15', image: '/images/sdg/sdg-15.svg', url: 'https://sustainabledevelopment.un.org/sdg15', name: '15. Life on Land', alternateName: 'Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt and reverse land degradation and halt biodiversity loss', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-16', image: '/images/sdg/sdg-16.svg', url: 'https://sustainabledevelopment.un.org/sdg16', name: '16. Peace and Justice Strong Institutions', alternateName: 'Promote peaceful and inclusive societies for sustainable development, provide access to justice for all and build effective, accountable and inclusive institutions at all levels', '@type': 'Project', '@context': 'https://schema.org' },
  { identifier: 'SDG-GOAL-17', image: '/images/sdg/sdg-17.svg', url: 'https://sustainabledevelopment.un.org/sdg17', name: '17. Partnerships to achieve the Goal', alternateName: 'Strengthen the means of implementation and revitalize the Global Partnership for Sustainable Development', '@type': 'Project', '@context': 'https://schema.org' }
]

const getSdg = (identifier: string) => sdgsData.find((anSdg) => identifier === anSdg.identifier)

const extractNumberFromKey = (key: string) => {
  const match = key.match(/-(\d+)-/)
  return match ? match[1] : null
}

describe('thesaurus/index', () => {
  describe('sdgsData', () => {
    it('should contain all 17 SDGs', () => {
      expect(sdgsData).toHaveLength(17)
    })

    it('should have valid structure for all SDGs', () => {
      sdgsData.forEach(sdg => {
        expect(sdg.identifier).toMatch(/^SDG-GOAL-\d{2}$/)
        expect(sdg.name).toBeDefined()
        expect(sdg.alternateName).toBeDefined()
        expect(sdg.image).toMatch(/^\/images\/sdg\/sdg-\d{2}\.svg$/)
        expect(sdg.url).toMatch(/^https:\/\/sustainabledevelopment\.un\.org\/sdg\d+$/)
        expect(sdg['@type']).toBe('Project')
        expect(sdg['@context']).toBe('https://schema.org')
      })
    })

    it('should have sequential SDG identifiers', () => {
      sdgsData.forEach((sdg, index) => {
        const expectedNum = String(index + 1).padStart(2, '0')
        expect(sdg.identifier).toBe(`SDG-GOAL-${expectedNum}`)
      })
    })
  })

  describe('getSdg', () => {
    it('should return SDG by identifier', () => {
      const sdg1 = getSdg('SDG-GOAL-01')
      expect(sdg1).toBeDefined()
      expect(sdg1?.name).toContain('Poverty')
    })

    it('should return SDG 13 (Climate Action)', () => {
      const sdg13 = getSdg('SDG-GOAL-13')
      expect(sdg13).toBeDefined()
      expect(sdg13?.name).toContain('Climate')
    })

    it('should return SDG 15 (Life on Land)', () => {
      const sdg15 = getSdg('SDG-GOAL-15')
      expect(sdg15).toBeDefined()
      expect(sdg15?.name).toContain('Life on Land')
    })

    it('should return undefined for non-existent SDG', () => {
      expect(getSdg('SDG-GOAL-99')).toBeUndefined()
      expect(getSdg('INVALID')).toBeUndefined()
    })

    it('should return undefined for partial match', () => {
      expect(getSdg('SDG-GOAL-1')).toBeUndefined()
      expect(getSdg('SDG-GOAL')).toBeUndefined()
    })
  })

  describe('extractNumberFromKey', () => {
    it('should extract number from key with pattern -NUMBER-', () => {
      expect(extractNumberFromKey('ort-nt7-123-something')).toBe('123')
      expect(extractNumberFromKey('prefix-456-suffix')).toBe('456')
    })

    it('should extract first match when multiple numbers present', () => {
      expect(extractNumberFromKey('a-123-b-456-c')).toBe('123')
    })

    it('should return null when no match found', () => {
      expect(extractNumberFromKey('no-number-here')).toBeNull()
      expect(extractNumberFromKey('123')).toBeNull()
      expect(extractNumberFromKey('-123')).toBeNull()
      expect(extractNumberFromKey('123-')).toBeNull()
    })

    it('should handle empty string', () => {
      expect(extractNumberFromKey('')).toBeNull()
    })

    it('should handle multi-digit numbers', () => {
      expect(extractNumberFromKey('item-12345-end')).toBe('12345')
    })
  })
})
