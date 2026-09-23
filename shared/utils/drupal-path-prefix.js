/**
 * App locale -> Drupal URL path prefix, for the proven cases only (BL-1126).
 *
 * A Drupal URL path prefix is NOT a langcode. The langcode map used for JSON:API
 * language filters (mapLocaleToDrupal / buildDrupalLanguageFilter in
 * server/utils/translate/locale.js) maps `zh` -> `zh-hans`, but sites vary between
 * `zh` and `zh-hans` as the langcode while the `zh` path prefix still answers 200
 * (checked live on asean). So `zh` is deliberately absent here.
 *
 * `tl` -> `fil`: Drupal's Tagalog/Filipino prefix is `fil`; `/tl/...` 404s
 * (site settings, menus, forums), `/fil/...` is served.
 *
 * Add an entry only after checking the live prefix on a Drupal site.
 */
const DRUPAL_PATH_PREFIXES = Object.freeze({ tl: 'fil' });

/**
 * Drupal URL path prefix for an app locale. Unmapped locales pass through unchanged.
 *
 * @param {string} locale - App locale code (e.g. 'tl', 'zh', 'en')
 * @returns {string} Path prefix segment without slashes (e.g. 'fil', 'zh', 'en')
 */
export function drupalPathPrefix(locale) {
  return DRUPAL_PATH_PREFIXES[locale] || locale;
}
