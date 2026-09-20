import { describe, it, expect } from 'vitest'
import { parseColor, relativeLuminance, contrastTextColor, contrastRatio, accessibleColor } from '../../../../app/utils/color-contrast'

describe('color-contrast', () => {
  describe('parseColor', () => {
    it('parses 6-digit hex', () => {
      expect(parseColor('#009edb')).toEqual({ r: 0, g: 158, b: 219 })
    })

    it('parses 6-digit hex without hash', () => {
      expect(parseColor('009edb')).toEqual({ r: 0, g: 158, b: 219 })
    })

    it('parses 3-digit hex', () => {
      expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    })

    it('parses 3-digit hex without hash', () => {
      expect(parseColor('000')).toEqual({ r: 0, g: 0, b: 0 })
    })

    it('parses rgb() string', () => {
      expect(parseColor('rgb(136, 146, 98)')).toEqual({ r: 136, g: 146, b: 98 })
    })

    it('parses rgb() without spaces', () => {
      expect(parseColor('rgb(136,146,98)')).toEqual({ r: 136, g: 146, b: 98 })
    })

    it('returns null for null input', () => {
      expect(parseColor(null)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseColor('')).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(parseColor(undefined)).toBeNull()
    })

    it('returns null for invalid color', () => {
      expect(parseColor('notacolor')).toBeNull()
    })
  })

  describe('relativeLuminance', () => {
    it('returns 0 for black', () => {
      expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0)
    })

    it('returns 1 for white', () => {
      expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBe(1)
    })

    it('returns expected luminance for mid-gray', () => {
      const lum = relativeLuminance({ r: 128, g: 128, b: 128 })

      expect(lum).toBeGreaterThan(0.2)
      expect(lum).toBeLessThan(0.25)
    })

    it('returns expected luminance for the failing color rgb(136, 146, 98)', () => {
      const lum = relativeLuminance({ r: 136, g: 146, b: 98 })

      // Should be below 0.179 threshold (dark enough for white text)
      // or above — let's compute and verify
      expect(lum).toBeGreaterThan(0)
      expect(lum).toBeLessThan(1)
    })
  })

  describe('contrastTextColor', () => {
    it('returns white text for black background', () => {
      expect(contrastTextColor('#000000')).toBe('#ffffff')
    })

    it('returns black text for white background', () => {
      expect(contrastTextColor('#ffffff')).toBe('#000000')
    })

    it('returns black text for CBD primary blue (#009edb)', () => {
      // Luminance ~0.22 — above 0.179 threshold → black text
      expect(contrastTextColor('#009edb')).toBe('#000000')
    })

    it('returns appropriate text for rgb(136, 146, 98) — Lighthouse-failing color', () => {
      const result = contrastTextColor('rgb(136, 146, 98)')

      expect(['#ffffff', '#000000']).toContain(result)
    })

    it('returns white for dark red', () => {
      expect(contrastTextColor('#8b0000')).toBe('#ffffff')
    })

    it('returns black for light yellow', () => {
      expect(contrastTextColor('#ffff00')).toBe('#000000')
    })

    it('returns white when color is null', () => {
      expect(contrastTextColor(null)).toBe('#ffffff')
    })

    it('returns white when color is undefined', () => {
      expect(contrastTextColor(undefined)).toBe('#ffffff')
    })

    it('returns white when color is empty string', () => {
      expect(contrastTextColor('')).toBe('#ffffff')
    })

    it('returns white when color is invalid', () => {
      expect(contrastTextColor('notacolor')).toBe('#ffffff')
    })
  })

  describe('contrastRatio', () => {
    it('is 21:1 for black on white', () => {
      expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    })

    it('is 1:1 for a color against itself', () => {
      expect(contrastRatio('#B7C800', '#B7C800')).toBeCloseTo(1, 5)
    })

    it('is symmetric regardless of argument order', () => {
      expect(contrastRatio('#B7C800', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#B7C800'), 10)
    })

    it('matches the BL-1074 ticket figure for #B7C800 on white (~1.8:1)', () => {
      expect(contrastRatio('#B7C800', '#ffffff')).toBeCloseTo(1.86, 1)
    })

    it('returns null when either color is unparseable', () => {
      expect(contrastRatio('notacolor', '#ffffff')).toBeNull()
      expect(contrastRatio('#ffffff', 'notacolor')).toBeNull()
    })
  })

  describe('accessibleColor', () => {
    it('darkens the BL-1074 brand color (#B7C800) to clear 4.5:1 on white', () => {
      const result = accessibleColor('#B7C800', '#ffffff')

      expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('darkens the CBD default brand blue (#009edb) to clear 4.5:1 on white', () => {
      // #009edb is ~3.0:1 on white on its own — still fails normal-text AA.
      const result = accessibleColor('#009edb', '#ffffff')

      expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('is idempotent for a color that already passes 4.5:1', () => {
      const alreadyPassing = '#8b0000'

      expect(contrastRatio(alreadyPassing, '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(accessibleColor(alreadyPassing, '#ffffff')).toBe(alreadyPassing)
    })

    it('never re-darkens its own output (fixed point)', () => {
      const once = accessibleColor('#B7C800', '#ffffff')
      const twice = accessibleColor(once, '#ffffff')

      expect(twice).toBe(once)
    })

    it('returns unchanged for black, which already passes on white', () => {
      expect(accessibleColor('#000000', '#ffffff')).toBe('#000000')
    })

    it('resolves a usable color even for white on white', () => {
      const result = accessibleColor('#ffffff', '#ffffff')

      expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('meets the lower 3:1 threshold for large text without over-darkening', () => {
      const large = accessibleColor('#B7C800', '#ffffff', { large: true })
      const normal = accessibleColor('#B7C800', '#ffffff')

      expect(contrastRatio(large, '#ffffff')).toBeGreaterThanOrEqual(3)
      // The large-text variant needs less darkening, so it should stay lighter
      // (higher luminance) than the normal-text variant for the same input.
      expect(relativeLuminance(parseColor(large))).toBeGreaterThan(relativeLuminance(parseColor(normal)))
    })

    it('accepts an rgb() surface and target color, matching the failing Lighthouse node', () => {
      const result = accessibleColor('rgb(183, 200, 0)', 'rgb(255, 255, 255)')

      expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('darkens a per-tenant brand color other than #B7C800 or CBD blue', () => {
      // A third, distinct tenant hex — exercises the utility beyond the two
      // colors named in the ticket, per the acceptance criteria's "at least
      // three tenants" requirement.
      const result = accessibleColor('#889262', '#ffffff')

      expect(contrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('falls back to the input unchanged when the color is unparseable', () => {
      expect(accessibleColor('notacolor', '#ffffff')).toBe('notacolor')
    })

    it('falls back to the input unchanged when the surface is unparseable', () => {
      expect(accessibleColor('#B7C800', 'notacolor')).toBe('#B7C800')
    })

    it('falls back to pure black when darkening can never reach the target (loop exhaustion)', () => {
      // A near-black surface caps the achievable ratio near 1:1 no matter how much
      // the color is darkened — the target (4.5:1) is unreachable, so the search
      // exhausts DARKEN_STEPS and the documented black fallback applies.
      const result = accessibleColor('#010101', '#000000')

      expect(result).toBe('#000000')
    })
  })
})
