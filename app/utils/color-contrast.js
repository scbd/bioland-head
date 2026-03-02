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
