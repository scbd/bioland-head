import { describe, it, expect } from 'vitest'
import { isRetinaDisplay, buildGbifBaseTileUrl, buildGbifOccurrenceTileUrl } from '../../../../app/utils/gbif-tile-url'

describe('gbif-tile-url', () => {
  describe('isRetinaDisplay', () => {
    it('is false at devicePixelRatio 1', () => {
      expect(isRetinaDisplay(1)).toBe(false)
    })

    it('is false when devicePixelRatio is omitted (defaults to 1)', () => {
      expect(isRetinaDisplay()).toBe(false)
    })

    it('is true above devicePixelRatio 1', () => {
      expect(isRetinaDisplay(2)).toBe(true)
      expect(isRetinaDisplay(1.5)).toBe(true)
    })
  })

  describe('buildGbifBaseTileUrl', () => {
    it('omits the @2x suffix at devicePixelRatio 1', () => {
      expect(buildGbifBaseTileUrl(1)).toBe('https://tile.gbif.org/3857/omt/{z}/{x}/{y}.png?style=gbif-classic')
    })

    it('omits the @2x suffix when devicePixelRatio is not provided', () => {
      expect(buildGbifBaseTileUrl()).not.toContain('@2x')
    })

    it('keeps the @2x suffix on a retina display', () => {
      expect(buildGbifBaseTileUrl(2)).toBe('https://tile.gbif.org/3857/omt/{z}/{x}/{y}@2x.png?style=gbif-classic')
    })
  })

  describe('buildGbifOccurrenceTileUrl', () => {
    it('omits the @2x suffix at devicePixelRatio 1', () => {
      const url = buildGbifOccurrenceTileUrl('BE', 1)

      expect(url).toContain('/{z}/{x}/{y}.png?')
      expect(url).not.toContain('@2x')
    })

    it('keeps the @2x suffix on a retina display', () => {
      const url = buildGbifOccurrenceTileUrl('BE', 2)

      expect(url).toContain('/{z}/{x}/{y}@2x.png?')
    })

    it('includes the country code in the query string', () => {
      expect(buildGbifOccurrenceTileUrl('CA', 1)).toContain('country=CA')
    })

    it('preserves the rest of the occurrence overlay query params', () => {
      const url = buildGbifOccurrenceTileUrl('BE', 1)

      expect(url).toBe(
        'https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}.png?style=classic-noborder.poly&bin=hex&country=BE&hasCoordinate=true&hasGeospatialIssue=false&advanced=false&srs=EPSG%3A3857'
      )
    })
  })
})
