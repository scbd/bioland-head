/**
 * Locale mapping utilities for AWS Translate
 * Maps Drupal/app locale codes to AWS Translate language codes
 *
 * @module server/utils/translate/locale
 */

/**
 * Map locale code from Drupal/app format to AWS Translate format
 * Handles special cases and Chinese variants
 *
 * @param {string} locale - Drupal locale code (e.g., 'en', 'zh-hans', 'pt-br')
 * @returns {string} AWS Translate language code
 */
export function mapLocaleFromDrupal(locale) {
  if (!locale) return 'en'

  const lower = locale.toLowerCase()

  // Chinese variants
  if (lower === 'zh-hans') return 'zh'
  if (lower === 'zh-hant') return 'zh-TW'

  // Portuguese variants
  if (lower === 'pt-br') return 'pt'
  if (lower === 'pt-pt') return 'pt-PT'

  // Spanish variants
  if (lower === 'es-419') return 'es'
  if (lower === 'es-mx') return 'es-MX'

  // French variants
  if (lower === 'fr-ca') return 'fr-CA'

  // Arabic variants
  if (lower === 'ar-sa') return 'ar'

  // English variants
  if (lower.startsWith('en-')) return 'en'

  // Extract base language code (before any hyphen)
  const base = lower.split('-')[0]

  return base
}

/**
 * Map locale code from AWS Translate format back to Drupal/app format
 *
 * @param {string} awsLocale - AWS Translate language code
 * @returns {string} Drupal locale code
 */
export function mapLocaleToDrupal(awsLocale) {
  if (!awsLocale) return 'en'

  const mapping = {
    zh: "zh-hans",
    'tl' : "fil",
    "zh-TW": "zh-hans",
    "pt-br": "pt",
    "pt-pt": "pt",
    "es-mx": "es",
    "fr-ca": "fr",
  };

  return mapping[awsLocale] || awsLocale.toLowerCase()
}

/**
 * Drupal langcode candidates for an app locale.
 *
 * Bioland sites are not consistent about Chinese/Filipino langcodes: a site's
 * content may be stored under the app code ('zh', 'tl') OR its Drupal variant
 * ('zh-hans', 'fil'). Returning both lets a JSON:API language filter match
 * regardless of which prefix a given site uses.
 *
 * @param {string} locale - App locale code (e.g. 'zh', 'tl', 'en')
 * @returns {string[]} Unique candidate Drupal langcodes (e.g. ['zh', 'zh-hans'])
 */
export function getDrupalLangcodeCandidates(locale) {
  if (!locale) return []

  return [...new Set([locale, mapLocaleToDrupal(locale)])]
}

/**
 * Build a JSON:API language filter matching any Drupal langcode variant for an
 * app locale. Uses the IN operator so app locale 'zh' matches content stored
 * under either 'zh' or 'zh-hans'.
 *
 * @param {string} locale - App locale code
 * @returns {string} Query string fragment (prefixed with '&'), or '' when no locale
 */
export function buildDrupalLanguageFilter(locale) {
  const langcodes = getDrupalLangcodeCandidates(locale)

  if (!langcodes.length) return ''

  return '&filter[language][operator]=IN' +
    langcodes.map((code) => `&filter[language][value][]=${encodeURIComponent(code)}`).join('')
}
