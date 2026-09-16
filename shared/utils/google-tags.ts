/**
 * Google tag configuration parsing and the single on/off switch.
 *
 * A site's Google tag IDs arrive as a single comma separated string on the Drupal
 * `bioland.settings` bag, surfaced to the client as
 * `siteStore.biolandSettings.googleAnalyticsIds`, alongside the administrator's explicit
 * `googleAnalyticsEnabled` switch. Nothing here loads a script: this module only decides which
 * tokens are admissible and whether the administrator has turned measurement on. The loader lives
 * in `app/plugins/google-tags.client.ts`.
 *
 * BL-1015 removed the deployment gate that used to sit here (`isGoogleTagsSite`, keyed on `env`,
 * `multiSiteCode`, dmsm's `published` flag and a `<siteCode>.chm-cbd.net` host template). Tags used
 * to activate on the presence of IDs, narrowed by rules no administrator could see from the admin
 * UI. The Drupal checkbox is now the only control, so no environment name appears in any GA code
 * path. Visitor consent is a separate gate and still applies, in the plugin.
 */

/**
 * The only token grammar admitted into a tag loader.
 *
 * Prefix set, in Google's own naming: `G-` GA4 measurement, `GTM-` Tag Manager container,
 * `AW-` Google Ads conversion, `DC-` Campaign Manager / floodlight, `UA-` legacy Universal
 * Analytics. The prefix is matched on its own, then the remainder is limited to upper case
 * alphanumerics and hyphens, so nothing that could alter a URL ever reaches a `src`.
 *
 * Tokens are upper cased before they are tested, which is why the pattern has no lower case
 * branch. Real measurement and container IDs are already upper case.
 */
export const GOOGLE_TAG_ID_PATTERN = /^(G|GTM|AW|DC|UA)-[A-Z0-9-]+$/;

/**
 * The outcome of parsing a site's configured tag string.
 *
 * `gtm` is kept apart from `gtag` because a Tag Manager container needs its own `gtm.js` script,
 * not a `config` call on the gtag shim. `rejected` keeps the normalised token so a log line or a
 * PR body can name what was dropped. Nothing in the app renders `rejected`.
 */
export interface GoogleTagIds {
    gtag: string[];
    gtm: string[];
    rejected: string[];
}

/**
 * Decides whether the administrator has turned Google Analytics on for this site.
 *
 * The value is the Drupal `bioland.settings` key `google_analytics_enabled`, camelCased at the
 * head boundary to `googleAnalyticsEnabled`. Drupal stores it as a real boolean and ships it as
 * `false` on every site and every environment, so the comparison is strict: a string `'true'`, a
 * `1`, a missing key, or a partially hydrated store all mean off. Failing closed here is the whole
 * point of the switch - a site must measure only because somebody ticked the box.
 */
export function isGoogleTagsEnabled(enabled?: unknown): boolean {
    return enabled === true;
}

/**
 * Splits a site's configured tag string into the three buckets a loader needs.
 *
 * Grammar: comma separated tokens, each trimmed and upper cased, empties dropped, duplicates
 * removed in first seen order, then classified against {@link GOOGLE_TAG_ID_PATTERN}. A token
 * starting `GTM-` lands in `gtm` because a container needs its own `gtm.js` script rather than a
 * `config` call; any other match lands in `gtag`; anything else lands in `rejected`.
 *
 * `undefined`, `null`, `''`, and every non string value mean the feature is off: they all return
 * three empty arrays, so a site that has never been configured behaves exactly as it did before.
 */
export function parseGoogleTagIds(raw: unknown): GoogleTagIds {
    if (typeof raw !== 'string') return { gtag: [], gtm: [], rejected: [] };

    const tokens = raw
        .split(',')
        .map((token) => token.trim().toUpperCase())
        .filter((token) => token.length > 0);

    const unique = [...new Set(tokens)];

    return unique.reduce<GoogleTagIds>(
        (acc, token) => {
            if (!GOOGLE_TAG_ID_PATTERN.test(token)) acc.rejected.push(token);
            else if (token.startsWith('GTM-')) acc.gtm.push(token);
            else acc.gtag.push(token);

            return acc;
        },
        { gtag: [], gtm: [], rejected: [] },
    );
}
