/**
 * Google tag configuration parsing and the single on/off switch.
 *
 * A site's Google tag IDs arrive as a single comma separated string on the Drupal
 * `bioland.settings` bag, surfaced to the client as
 * `siteStore.biolandSettings.googleAnalyticsIds`, alongside the administrator's explicit
 * `googleAnalyticsEnabled` switch. Nothing here loads a script: this module only decides which
 * tokens are admissible, whether the administrator has turned measurement on, and whether the
 * browser is on a hostname this tenant serves. The loader lives in
 * `app/plugins/google-tags.client.ts`.
 *
 * BL-1015 removed the deployment gate that used to sit here (`isGoogleTagsSite`). Tags activated on
 * the presence of IDs, narrowed by rules no administrator could see from the admin UI. The Drupal
 * checkbox is the only control now. Visitor consent is a separate gate and still applies, in the
 * plugin.
 *
 * BL-1030 restored the other half of BL-946, which asks *where* a site may measure rather than
 * whether: {@link isGoogleTagsBrowserHost} requires the hostname the visitor's browser is actually
 * on to be one this tenant serves. The attacker it stops is a reverse proxy on an origin the
 * attacker owns, forwarding a real tenant's `Host`. `server/utils/context-unified.ts` fails closed
 * on an unmapped `Host`, but forwarding a *valid* one is a line of proxy config, so the tenant
 * resolves normally and its live `G-`, `AW-`, `DC-` and `GTM-` IDs would execute on that page -
 * write access to the tenant's GA4 property and Google Ads conversion stream, and its GTM
 * container running arbitrary marketing JS, from an origin the tenant does not control. No
 * server-side check can substitute, because only the visitor's browser knows the origin it is
 * really on, which is why the assertion is client-side and takes the hostname as an argument.
 *
 * The allowed host set comes from dmsm alone - no environment name, no publication flag, no
 * multisite allowlist, and no hard-coded host template. `cookie_domain` stays pinned to the
 * current hostname in the plugin, which is a separate protection and still wanted.
 */

import { getGeneratedHostname, normalizeRedirectHost } from './site-host';

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
 * The slice of site context the browser-host assertion reads, straight off the site store.
 *
 * Every field is `unknown` because all three originate in untyped dmsm operator config: a
 * partially hydrated store, a missing key, or a value of the wrong type has to fail closed rather
 * than throw. `siteCode` and `baseHost` are the store's own values, which
 * `server/utils/context-unified.ts` derives from dmsm; `redirect` is dmsm's `config.redirect`
 * carried through `app/stores/site.js` verbatim.
 */
export interface GoogleTagHostContext {
    siteCode?: unknown;
    baseHost?: unknown;
    redirect?: unknown;
}

/**
 * Reduces a candidate host to a bare, lower cased hostname suitable for an exact comparison.
 *
 * Used for the browser's `window.location.hostname` and for the generated host, which arrives as
 * an HTTPS origin, so a scheme is accepted and unwrapped. Redirect aliases use the canonical
 * `normalizeRedirectHost` contract instead. Anything else fails closed with `null`: a non HTTPS
 * scheme, embedded credentials, an explicit port, a non root path, a query or a fragment, or a
 * bare string still carrying `/`, `@`, or `:`. That rejects host confusable input such as
 * `evil.test/real.chm-cbd.net` or a userinfo trick instead of quietly accepting it.
 */
function normalizeGoogleTagHost(rawHost: unknown): string | null {
    if (typeof rawHost !== 'string' || rawHost.length === 0) return null;

    let hostname: string;

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawHost)) {
        let url: URL;

        try {
            url = new URL(rawHost);
        } catch {
            return null;
        }

        if (url.protocol !== 'https:') return null;
        if (url.username || url.password) return null;
        if (url.port) return null;
        if (url.pathname !== '/' && url.pathname !== '') return null;
        if (url.search || url.hash) return null;

        hostname = url.hostname;
    } else {
        hostname = rawHost;
    }

    if (!hostname || hostname.includes('/') || hostname.includes('@') || hostname.includes(':')) return null;

    return hostname.toLowerCase();
}

/**
 * Decides whether the hostname the visitor's browser is on is one this tenant actually serves.
 *
 * The allowed set is exactly two hostnames, both derived from dmsm and nothing else:
 *
 * 1. The tenant's generated host, the hostname part of
 *    {@link getGeneratedHostname}`(siteCode, baseHost)`. dmsm owns both halves, so a multisite
 *    whose `baseHost` is `chm-cbd.net` yields `<siteCode>.chm-cbd.net` without a template here.
 * 2. The tenant's redirect alias, `normalizeRedirectHost(redirect)`, when dmsm has configured a
 *    usable one. `app/stores/site.js` carries dmsm's value through unconditionally, so this is
 *    visible in every environment.
 *
 * `browserHost` is an argument rather than a `window` read so this module stays pure and unit
 * testable; `app/plugins/google-tags.client.ts` passes `window.location.hostname`. It is the one
 * input a proxy forwarding a tenant `Host` header cannot forge for the visitor.
 *
 * Everything fails closed: a missing or non string `siteCode` or `baseHost`, a browser host that
 * does not normalise, a generated host that does not normalise (a `baseHost` carrying a port or a
 * path, say), and a hostname matching neither member of the set all return `false`. This asks only
 * *where* a site may measure - *whether* is the administrator's Drupal checkbox, read by
 * {@link isGoogleTagsEnabled}, and both are required.
 */
export function isGoogleTagsBrowserHost(site?: GoogleTagHostContext | null, browserHost?: string | null): boolean {
    if (!site || typeof site !== 'object') return false;

    const { siteCode, baseHost, redirect } = site;

    if (typeof siteCode !== 'string' || typeof baseHost !== 'string') return false;
    if (siteCode.length === 0 || baseHost.length === 0) return false;

    const actualHost = normalizeGoogleTagHost(browserHost);

    if (actualHost === null) return false;

    const generatedHost = normalizeGoogleTagHost(getGeneratedHostname(siteCode, baseHost));

    if (generatedHost !== null && actualHost === generatedHost) return true;

    const redirectAlias = normalizeRedirectHost(redirect);

    return redirectAlias !== null && actualHost === redirectAlias;
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
