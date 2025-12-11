import { describe, it, expect } from 'vitest'
import { ecosystemTypes } from '~/server/utils/thesaurus/ecosystems'

describe('thesaurus/ecosystems', () => {
  describe('ecosystemTypes', () => {
    it('should be an array of ecosystem types', () => {
      expect(Array.isArray(ecosystemTypes)).toBe(true)
      expect(ecosystemTypes.length).toBeGreaterThan(0)
    })

    it('should have valid structure for all types', () => {
      ecosystemTypes.forEach(ecosystem => {
        expect(ecosystem.identifier).toBeDefined()
        expect(typeof ecosystem.identifier).toBe('string')
        expect(ecosystem.name).toBeDefined()
        expect(ecosystem.name.en).toBeDefined()
      })
    })

    it('should have identifiers matching IUCN pattern', () => {
      ecosystemTypes.forEach(ecosystem => {
        expect(ecosystem.identifier).toMatch(/^T\d+\.\d+$/)
      })
    })

    it('should contain tropical ecosystem types', () => {
      const tropical = ecosystemTypes.filter(e => e.identifier.startsWith('T1.'))
      expect(tropical.length).toBeGreaterThan(0)
      expect(tropical.some(e => e.name.en.includes('Tropical'))).toBe(true)
    })

    it('should contain temperate ecosystem types', () => {
      const temperate = ecosystemTypes.filter(e => e.identifier.startsWith('T2.'))
      expect(temperate.length).toBeGreaterThan(0)
      expect(temperate.some(e => e.name.en.includes('Temperate'))).toBe(true)
    })

    it('should contain boreal ecosystem types', () => {
      const boreal = ecosystemTypes.filter(e => e.identifier.startsWith('T3.'))
      expect(boreal.length).toBeGreaterThan(0)
      expect(boreal.some(e => e.name.en.includes('Boreal'))).toBe(true)
    })

    it('should contain marine ecosystem types', () => {
      const marine = ecosystemTypes.filter(e => e.identifier.startsWith('T7.'))
      expect(marine.length).toBeGreaterThan(0)
      expect(marine.some(e => e.name.en.includes('Marine'))).toBe(true)
    })

    it('should have unique identifiers', () => {
      const identifiers = ecosystemTypes.map(e => e.identifier)
      const unique = new Set(identifiers)
      expect(unique.size).toBe(identifiers.length)
    })
  })
})
