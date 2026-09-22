/**
 * Parse the Drupal focal-point string ("X,Y", integer percentages 0-100)
 * into a clamped { x, y } point. Returns null for missing/malformed input
 * so callers can fall back to default (centered) behaviour.
 *
 * @param   {unknown}  value  e.g. "50,30"
 * @returns {{ x: number, y: number } | null}
 */
export function parseFocalPoint(value) {
  if (typeof value !== 'string') return null

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/)

  if (!match) return null

  const x = clampPercent(Number(match[1]))
  const y = clampPercent(Number(match[2]))

  if (x === null || y === null) return null

  return { x, y }
}

/**
 * Build a CSS `object-position` value from a Drupal focal-point string.
 *
 * @param   {unknown}  value  e.g. "50,30"
 * @returns {string | null}  e.g. "50% 30%", or null when unset/invalid
 */
export function focalPointObjectPosition(value) {
  const point = parseFocalPoint(value)

  return point ? `${point.x}% ${point.y}%` : null
}

function clampPercent(n) {
  if (!Number.isFinite(n)) return null

  return Math.min(100, Math.max(0, n))
}
