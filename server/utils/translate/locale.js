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
