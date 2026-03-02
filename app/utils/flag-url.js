/**
 * Returns a flag image URL for the given country code.
 * When used with <NuxtImg>, the IPX provider automatically proxies the
 * request through the local domain (/_ipx/…) because www.cbd.int is
 * listed in nuxt.config image.domains. This eliminates third-party cookies.
 *
 * @param   {string} countryCode - ISO country code (e.g. 'BE', 'US')
 * @param   {number} [size=96]   - Flag image size (matches cbd.int sprite sizes)
 * @returns {string} Flag image URL (empty string when countryCode is falsy)
 */
export function getFlagUrl(countryCode, size = 96) {
  if (!countryCode) return ''

  return `https://www.cbd.int/images/flags/${size}/flag-${countryCode}-${size}.png`
}
