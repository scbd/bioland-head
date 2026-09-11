/**
 * Derive the URL the CHM-network widget shows for one Site.
 *
 * Prefers the canonical `site.host` set by `server/api/chm-network/index.js`, and falls back to the
 * legacy `<siteCode>.<baseHost>` formula only when that field is absent, which happens while a
 * cached API response predates the field.
 *
 * @param {{ siteCode?: string, host?: string }} site - Site entry from `/api/chm-network`.
 * @param {{ baseHost?: string }} config - The section's DMSM config.
 * @param {boolean} [withProtocol] - Keep the `https://` scheme when true, strip it when false.
 * @returns {string} The Site URL, or an empty string when `site` or `config` is missing.
 */
export function getChmNetworkSiteUrl(site, config, withProtocol = false) {
  if (!site || !config) return '';

  const proto = withProtocol ? 'https://' : '';

  if (site.host) return withProtocol ? site.host : site.host.replace(/^https?:\/\//, '');

  return `${proto}${site.siteCode}.${config.baseHost}`;
}
