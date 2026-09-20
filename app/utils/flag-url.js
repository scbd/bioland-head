/**
 * Returns a flag image URL for the given country code.
 *
 * Served same-origin through server/routes/images/flags/[size]/[code].get.js, which
 * re-hosts the cbd.int sprite server-side. That route strips the incoming Cookie header
 * before it fetches upstream, so no www.cbd.int session cookie is ever sent by the browser
 * for a flag image (BL-1071).
 *
 * The URL is relative and already served pre-sized, so any <NuxtImg> using it needs
 * `provider="none"` (skip the ipx transform - the default ipx provider resolves a relative
 * src from local disk, not this dynamic route, and would 404) plus matching width/height
 * (or the 96 default) to avoid a Lighthouse unsized-images layout-shift warning.
 *
 * @param   {string} countryCode - ISO country code (e.g. 'BE', 'US')
 * @param   {number} [size=96]   - Flag image size (matches cbd.int sprite sizes)
 * @returns {string} Flag image URL (empty string when countryCode is falsy)
 */
export function getFlagUrl(countryCode, size = 96) {
  if (!countryCode) return ''

  return `/images/flags/${size}/${countryCode}`
}
