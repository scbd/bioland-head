/**
 * Right-to-left (RTL) language codes
 * Shared between Vue app and Nitro server
 */
export const rtl = ['am', 'ar', 'az', 'he', 'fa', 'ur', 'mv', 'ku']

/**
 * Check if a locale is RTL
 * @param {string} locale - The locale code to check
 * @returns {boolean} - True if the locale is RTL
 */
export const isRtl = (locale) => rtl.includes(locale)
