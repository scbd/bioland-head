import { describe, it, expect } from 'vitest'
import {
  documentStates,
  orgTypeOther,
  gbfTargets,
  sdgsShort
} from '~/server/utils/thesaurus/static-data'

describe('thesaurus/static-data', () => {
  describe('documentStates', () => {
    it('should contain expected workflow states', () => {
      const identifiers = documentStates.map(s => s.identifier)
      expect(identifiers).toContain('draft')
      expect(identifiers).toContain('published')
      expect(identifiers).toContain('rejected')
      expect(identifiers).toContain('deleted')
    })

    it('should have valid structure for all states', () => {
      documentStates.forEach(state => {
        expect(state.identifier).toBeDefined()
        expect(typeof state.identifier).toBe('string')
        expect(state.name).toBeDefined()
        expect(state.name.en).toBeDefined()
      })
    })
  })

  describe('orgTypeOther', () => {
    it('should be a valid organization type fallback', () => {
      expect(orgTypeOther.identifier).toBe('ORG-TYPE-OTHER')
      expect(orgTypeOther.name.en).toBe('Other')
      expect(orgTypeOther.title?.en).toBe('Other')
    })
  })

  describe('gbfTargets', () => {
    it('should contain all 23 GBF targets', () => {
      expect(gbfTargets).toHaveLength(23)
    })

    it('should have sequential target identifiers', () => {
      gbfTargets.forEach((target, index) => {
        const expectedId = `GBF-TARGET-${String(index + 1).padStart(2, '0')}`
        expect(target.identifier).toBe(expectedId)
      })
    })

    it('should have English names for all targets', () => {
      gbfTargets.forEach(target => {
        expect(target.name.en).toBeDefined()
        expect(target.name.en).toMatch(/^Target \d+$/)
      })
    })
  })

  describe('sdgsShort', () => {
    it('should contain English SDG short names', () => {
      expect(sdgsShort.en).toBeDefined()
      expect(Array.isArray(sdgsShort.en)).toBe(true)
    })

    it('should have all 17 SDGs', () => {
      expect(sdgsShort.en).toHaveLength(17)
    })

    it('should have numbered SDG names', () => {
      sdgsShort.en.forEach((sdg, index) => {
        expect(sdg).toMatch(new RegExp(`^${index + 1}\\.`))
      })
    })

    it('should include key SDGs', () => {
      expect(sdgsShort.en[0]).toContain('Poverty')
      expect(sdgsShort.en[12]).toContain('Climate')
      expect(sdgsShort.en[14]).toContain('Life on Land')
    })
  })
})
