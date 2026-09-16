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
 * BL-1015 removed the deployment gate that used to sit here (`isGoogleTagsSite`). Tags activated on
 * the presence of IDs, narrowed by rules no administrator could see from the admin UI. The Drupal
 * checkbox is the only control now. Visitor consent is a separate gate and still applies, in the
 * plugin.
 *
 * One control was traded away rather than found redundant, and the next reader should know it. The
 * browser-host half of that gate was BL-946's answer to a specific attacker: a reverse proxy on an
 * origin it owns, forwarding a real tenant's `Host`, so the tenant's live `G-`, `AW-`, `DC-` and
 * `GTM-` IDs execute on that origin. That is unmitigated again, and no server-side check can
 * replace it, because only the browser knows the origin it is really on. It asks where a site may
 * measure, not whether, so it is severable from this module and BL-1030 tracks restoring it.
 * The plugin pins `cookie_domain` on its own gtag `config` calls, isolating those cookies from the
 * real site. GTM container-defined tags can override that setting or fire their own pixels. Cookie
 * pinning does not prevent conversion or ad-spend pollution from `AW-` and `DC-` IDs on that origin.
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
 * `false` on every site, so the comparison is strict: a string `'true'`, a `1`, a missing key, or a
 * partially hydrated store all mean off. Failing closed here is the whole point of the switch - a
 * site must measure only because somebody ticked the box.
 */
export function isGoogleTagsEnabled(enabled?: unknown): boolean {
    return enabled === true;
}

/**
 * True when the stored value is trying to say yes but is not the boolean `true`.
 *
 * Drupal does not enforce its own boolean schema on a write, so `drush config:set ... 1` stores the
 * number and a hand-edited import can store `'true'`. {@link isGoogleTagsEnabled} rightly reads
 * those as off, but silently: the administrator sees a ticked-looking intent and no tags, with
 * nothing to search for. The plugin logs one warning on this so the misconfiguration is findable.
 */
export function isGoogleTagsMisconfigured(enabled?: unknown): boolean {
    return enabled !== true && Boolean(enabled);
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
