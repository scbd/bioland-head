/**
 * Builds GBIF tile-layer URLs for the home-page occurrence map (BL-1079).
 *
 * GBIF's `@2x` tiles are 1024x1024 (4x the bytes of the 256x256 @1x tile)
 * and are only worth requesting on a genuinely retina display. Hard-coding
 * `@2x` wastes bandwidth on every desktop screen at devicePixelRatio 1.
 */

/**
 * @param   {number} [devicePixelRatio=1]
 * @returns {boolean}
 */
export function isRetinaDisplay(devicePixelRatio = 1) {
  return devicePixelRatio > 1
}

/**
 * @param   {number} [devicePixelRatio=1] - window.devicePixelRatio (client-only; defaults to 1)
 * @returns {string} tile.gbif.org base layer URL, with @2x only above DPR 1
 */
export function buildGbifBaseTileUrl(devicePixelRatio = 1) {
  const suffix = isRetinaDisplay(devicePixelRatio) ? '@2x' : ''

  return `https://tile.gbif.org/3857/omt/{z}/{x}/{y}${suffix}.png?style=gbif-classic`
}

/**
 * @param   {string} [countryCode]        - ISO country code identifier from site config
 * @param   {number} [devicePixelRatio=1] - window.devicePixelRatio (client-only; defaults to 1)
 * @returns {string} api.gbif.org occurrence overlay URL, with @2x only above DPR 1
 */
export function buildGbifOccurrenceTileUrl(countryCode, devicePixelRatio = 1) {
  const suffix = isRetinaDisplay(devicePixelRatio) ? '@2x' : ''

  return `https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}${suffix}.png?style=classic-noborder.poly&bin=hex&country=${countryCode}&hasCoordinate=true&hasGeospatialIssue=false&advanced=false&srs=EPSG%3A3857`
}
