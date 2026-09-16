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
 * `server/utils/context-unified.ts` derives from dmsm; `redirect` is dmsm's `config.redirect`,
 * read off `siteStore.config` where the store holds that payload verbatim in every environment.
 */
export interface GoogleTagHostContext {
    siteCode?: unknown;
    baseHost?: unknown;
    redirect?: unknown;
}

/**
 * Reduces an untrusted, bare hostname to the form used for an exact comparison.
 *
 * This is the normaliser for `browserHost`, the one argument that does not come from dmsm. It
 * accepts a bare hostname and nothing else: no scheme is unwrapped here, so a caller that later
 * hands this `document.referrer`, an `Origin` header or any other full URL fails closed instead of
 * being quietly accepted on the hostname inside it. `window.location.hostname`, the production
 * caller, is already exactly this shape.
 *
 * Lower cased, with one trailing dot stripped - browsers preserve the dot a visitor typed in
 * `location.hostname`, and `normalizeRedirectHost` strips it from the configured value, so the two
 * would otherwise never meet. Anything still carrying `/`, `@`, `:`, `?` or `#` after that is
 * rejected, which kills host confusable input such as `evil.test/real.chm-cbd.net`, a userinfo
 * trick, an explicit port and a bracketed IPv6 literal.
 */
function normalizeBrowserHost(rawHost: unknown): string | null {
    if (typeof rawHost !== 'string' || rawHost.length === 0) return null;

    const hostname = rawHost.toLowerCase().replace(/\.$/, '');

    if (!hostname) return null;
    if (/[/@:?#]/.test(hostname)) return null;

    return hostname;
}

/**
 * Unwraps the HTTPS origin {@link getGeneratedHostname} returns into a bare hostname.
 *
 * Separate from {@link normalizeBrowserHost} because the trust levels differ: this input is built
 * from dmsm's own `siteCode` and `baseHost` and always arrives as `https://<host>`, so a scheme is
 * expected here and only here. A `baseHost` carrying a port, a path, credentials, a query or a
 * fragment still fails closed with `null`, which is the whole point of re-parsing operator config
 * rather than trusting the template that built it.
 */
function normalizeGeneratedHost(rawOrigin: string): string | null {
    let url: URL;

    try {
        url = new URL(rawOrigin);
    } catch {
        return null;
    }

    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (url.port) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    if (url.search || url.hash) return null;

    return normalizeBrowserHost(url.hostname);
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
 *    usable one - subject to the same cross-tenant rule `getCanonicalHost` applies in
 *    `shared/utils/site-host.ts`. An alias inside the multisite zone (`${baseHost}` itself, or
 *    anything under `.${baseHost}`) is only this tenant's if it *is* its generated host: inbound
 *    suffix routing resolves that zone before the dmsm reverse index, so `site-b.chm-cbd.net`
 *    configured on site A always lands on site B, and the bare apex lands on neither. Accepting
 *    those would widen the set past "hostnames this tenant serves". The alias is read from
 *    `siteStore.config.redirect`, dmsm's payload verbatim, so it is visible in every environment.
 *
 * `browserHost` is an argument rather than a `window` read so this module stays pure and unit
 * testable; `app/plugins/google-tags.client.ts` passes `window.location.hostname`. It is the one
 * input a proxy forwarding a tenant `Host` header cannot forge for the visitor, and it is
 * normalised as a bare hostname only - see {@link normalizeBrowserHost}.
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

    const actualHost = normalizeBrowserHost(browserHost);

    if (actualHost === null) return false;

    const generatedHost = normalizeGeneratedHost(getGeneratedHostname(siteCode, baseHost));

    if (generatedHost !== null && actualHost === generatedHost) return true;

    const redirectAlias = normalizeRedirectHost(redirect);

    if (redirectAlias === null) return false;

    const zone = baseHost.toLowerCase();
    const insideMultisiteZone = redirectAlias === zone || redirectAlias.endsWith(`.${zone}`);

    if (insideMultisiteZone && redirectAlias !== generatedHost) return false;

    return actualHost === redirectAlias;
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
