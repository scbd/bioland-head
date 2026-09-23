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

const APP_LOCALES_BY_DRUPAL_PREFIX = Object.freeze(
  Object.fromEntries(Object.entries(DRUPAL_PATH_PREFIXES).map(([locale, prefix]) => [prefix, locale]))
);

// Own keys only, so request-supplied values like 'constructor' never hit Object.prototype.
const lookup = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

/**
 * Drupal URL path prefix for an app locale. Unmapped locales pass through unchanged.
 *
 * @param {string} locale - App locale code (e.g. 'tl', 'zh', 'en')
 * @returns {string} Path prefix segment without slashes (e.g. 'fil', 'zh', 'en')
 */
export function drupalPathPrefix(locale) {
  return lookup(DRUPAL_PATH_PREFIXES, locale) || locale;
}

/**
 * Inverse of drupalPathPrefix for a root-relative path Drupal returned: rewrites a leading
 * Drupal prefix segment to the app locale (`/fil/about` -> `/tl/about`). Anything else,
 * including absolute URLs and unmapped prefixes, is returned unchanged.
 *
 * @param {string} path - Root-relative path from Drupal (menu href, canonical pathname)
 * @returns {string} The same path under the app locale prefix
 */
export function appPathFromDrupalPath(path) {
  if (typeof path !== 'string') return path;

  const match  = /^\/([^/?#]+)(?=[/?#]|$)/.exec(path);
  const locale = match && lookup(APP_LOCALES_BY_DRUPAL_PREFIX, match[1]);

  return locale ? `/${locale}${path.slice(match[0].length)}` : path;
}
