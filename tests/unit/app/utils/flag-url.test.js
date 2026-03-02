import { describe, it, expect } from 'vitest'
import { getFlagUrl } from '../../../../app/utils/flag-url'

describe('flag-url', () => {
  describe('getFlagUrl', () => {
    it('returns a flag URL for a valid country code', () => {
      expect(getFlagUrl('BE')).toBe('https://www.cbd.int/images/flags/96/flag-BE-96.png')
    })

    it('uses default size of 96', () => {
      expect(getFlagUrl('US')).toContain('/96/flag-US-96.png')
    })

    it('accepts a custom size', () => {
      expect(getFlagUrl('CA', 48)).toBe('https://www.cbd.int/images/flags/48/flag-CA-48.png')
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
      expect(getFlagUrl('be')).toBe('https://www.cbd.int/images/flags/96/flag-be-96.png')
    })
  })
})
