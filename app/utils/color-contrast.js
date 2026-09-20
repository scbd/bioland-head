/**
 * Parse a CSS color string (hex or rgb) to {r, g, b}
 *
 * @param   {string}  color  CSS color value (#hex or rgb())
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function parseColor(color) {
  if (!color) return null

  // Handle hex
  const hex = color.replace('#', '')

  if (/^[0-9a-f]{3,8}$/i.test(hex)) {
    const fullHex = hex.length === 3
      ? hex.split('').map(c => c + c).join('')
      : hex

    return {
      r: parseInt(fullHex.slice(0, 2), 16),
      g: parseInt(fullHex.slice(2, 4), 16),
      b: parseInt(fullHex.slice(4, 6), 16)
    }
  }

  // Handle rgb(r, g, b)
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)

  if (rgbMatch)
    return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] }

  return null
}

/**
 * Compute relative luminance per WCAG 2.1
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *
 * @param   {{ r: number, g: number, b: number }}  rgb
 * @returns {number}  Luminance value between 0 and 1
 */
export function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255

    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Returns '#ffffff' or '#000000' for best contrast on the given background.
 * Uses 0.179 luminance threshold (standard WCAG midpoint).
 *
 * @param   {string}  bgColor  CSS background color
 * @returns {string}  '#ffffff' or '#000000'
 */
export function contrastTextColor(bgColor) {
  const parsed = parseColor(bgColor)

  if (!parsed) return '#ffffff'

  const lum = relativeLuminance(parsed)

  return lum > 0.179 ? '#000000' : '#ffffff'
}

/**
 * Format an {r,g,b} triple as a lowercase 6-digit hex string.
 *
 * @param   {{ r: number, g: number, b: number }}  rgb
 * @returns {string}
 */
function toHex({ r, g, b }) {
  const clamp = n => Math.min(255, Math.max(0, Math.round(n)))
  const hex   = n => clamp(n).toString(16).padStart(2, '0')

  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * WCAG 2.1 contrast ratio between two colors, in either order.
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * @param   {string}  colorA  CSS color value (#hex or rgb())
 * @param   {string}  colorB  CSS color value (#hex or rgb())
 * @returns {number|null}  Ratio between 1 and 21, or null if either color is unparseable
 */
export function contrastRatio(colorA, colorB) {
  const a = parseColor(colorA)
  const b = parseColor(colorB)

  if (!a || !b) return null

  const lumA = relativeLuminance(a)
  const lumB = relativeLuminance(b)
  const lighter = Math.max(lumA, lumB)
  const darker  = Math.min(lumA, lumB)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Darken an {r,g,b} color by a fraction (0-1) toward black, in RGB space.
 * A simple linear step is sufficient here: we only need a monotonically
 * darkening sequence to search over, not perceptual uniformity.
 *
 * @param   {{ r: number, g: number, b: number }}  rgb
 * @param   {number}  amount  0 (no change) to 1 (black)
 * @returns {{ r: number, g: number, b: number }}
 */
function darken({ r, g, b }, amount) {
  const factor = 1 - amount

  return { r: r * factor, g: g * factor, b: b * factor }
}

/** Search granularity for accessibleColor's darkening loop. */
const DARKEN_STEPS = 1000

/**
 * Given a tenant color and the surface it sits on, return the nearest accessible
 * variant of that color: the same hue darkened just enough to clear the WCAG AA
 * contrast ratio against the surface (4.5:1 for normal text, 3:1 for large text).
 *
 * A color that already meets the target ratio is returned unchanged (idempotent) —
 * this never brightens a color, and never darkens one that already passes.
 *
 * @param   {string}   color              CSS color value (#hex or rgb()) to adjust
 * @param   {string}   [surface='#fff']   CSS color value of the surface behind the text
 * @param   {object}   [options]
 * @param   {boolean}  [options.large]    true for WCAG "large text" (3:1 instead of 4.5:1)
 * @returns {string}  A hex color meeting the target ratio, or `color` unchanged if it
 *                     cannot be parsed or the surface cannot be parsed.
 */
export function accessibleColor(color, surface = '#ffffff', { large = false } = {}) {
  const rgb        = parseColor(color)
  const surfaceRgb = parseColor(surface)

  if (!rgb || !surfaceRgb) return color

  const target = large ? 3 : 4.5
  const surfaceLum = relativeLuminance(surfaceRgb)

  const ratioAgainstSurface = candidate => {
    const lum = relativeLuminance(candidate)
    const lighter = Math.max(lum, surfaceLum)
    const darker  = Math.min(lum, surfaceLum)

    return (lighter + 0.05) / (darker + 0.05)
  }

  if (ratioAgainstSurface(rgb) >= target) return color

  // Darkening only helps when the surface is lighter than the color could become —
  // walk from unchanged (amount 0) to black (amount 1) and stop at the first step
  // that clears the target ratio. Round to the output hex's integer channels before
  // checking, not after — rounding a passing float candidate can knock its actual
  // (post-rounding) ratio back under the target.
  for (let step = 1; step <= DARKEN_STEPS; step += 1) {
    const hex = toHex(darken(rgb, step / DARKEN_STEPS))

    if (ratioAgainstSurface(parseColor(hex)) >= target) return hex
  }

  // Never reached in practice (black clears 4.5:1 against any surface at least as
  // light as mid-gray), but guarantees a return value for a pathological surface.
  return toHex({ r: 0, g: 0, b: 0 })
}
