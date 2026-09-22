import { describe, it, expect } from 'vitest'
import { parseFocalPoint, focalPointObjectPosition } from '../../../../app/utils/hero-focal-point'

describe('hero-focal-point', () => {
  describe('parseFocalPoint', () => {
    it('parses a valid "X,Y" pair', () => {
      expect(parseFocalPoint('50,30')).toEqual({ x: 50, y: 30 })
    })

    it('parses a pair with a space after the comma', () => {
      expect(parseFocalPoint('12, 88')).toEqual({ x: 12, y: 88 })
    })

    it('parses decimal percentages', () => {
      expect(parseFocalPoint('12.5,87.5')).toEqual({ x: 12.5, y: 87.5 })
    })

    it('clamps values above 100', () => {
      expect(parseFocalPoint('150,200')).toEqual({ x: 100, y: 100 })
    })

    it('clamps negative values to 0', () => {
      expect(parseFocalPoint('-10,-5')).toEqual({ x: 0, y: 0 })
    })

    it('returns null for null', () => {
      expect(parseFocalPoint(null)).toBeNull()
    })

    it('returns null for undefined', () => {
      expect(parseFocalPoint(undefined)).toBeNull()
    })

    it('returns null for an empty string', () => {
      expect(parseFocalPoint('')).toBeNull()
    })

    it('returns null for malformed input', () => {
      expect(parseFocalPoint('not-a-point')).toBeNull()
    })

    it('returns null for a single number', () => {
      expect(parseFocalPoint('50')).toBeNull()
    })

    it('returns null for a non-string value', () => {
      expect(parseFocalPoint(50)).toBeNull()
    })
  })

  describe('focalPointObjectPosition', () => {
    it('builds a CSS object-position string', () => {
      expect(focalPointObjectPosition('50,30')).toBe('50% 30%')
    })

    it('clamps out-of-range values in the built string', () => {
      expect(focalPointObjectPosition('-10,150')).toBe('0% 100%')
    })

    it('returns null when missing', () => {
      expect(focalPointObjectPosition(null)).toBeNull()
      expect(focalPointObjectPosition(undefined)).toBeNull()
    })

    it('returns null when malformed', () => {
      expect(focalPointObjectPosition('garbage')).toBeNull()
    })
  })
})
