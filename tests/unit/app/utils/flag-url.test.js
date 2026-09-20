import { describe, it, expect } from 'vitest'
import { getFlagUrl } from '../../../../app/utils/flag-url'

describe('flag-url', () => {
  describe('getFlagUrl', () => {
    it('returns a same-origin flag URL for a valid country code', () => {
      expect(getFlagUrl('BE')).toBe('/images/flags/96/BE')
    })

    it('never points at cbd.int directly (BL-1071 third-party-cookie fix)', () => {
      expect(getFlagUrl('BE')).not.toContain('cbd.int')
    })

    it('uses default size of 96', () => {
      expect(getFlagUrl('US')).toContain('/96/US')
    })

    it('accepts a custom size', () => {
      expect(getFlagUrl('CA', 48)).toBe('/images/flags/48/CA')
    })

    it('returns empty string for null', () => {
      expect(getFlagUrl(null)).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(getFlagUrl(undefined)).toBe('')
    })

    it('returns empty string for empty string', () => {
      expect(getFlagUrl('')).toBe('')
    })

    it('preserves lowercase country codes', () => {
      expect(getFlagUrl('be')).toBe('/images/flags/96/be')
    })
  })
})
