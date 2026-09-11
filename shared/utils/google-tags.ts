/**
 * Google tag configuration parsing and site eligibility.
 *
 * A site's Google tag IDs arrive as a single comma separated string on the Drupal
 * `bioland.settings` bag, surfaced to the client as
 * `siteStore.biolandSettings.googleAnalyticsIds`. Nothing here loads a script: this module only
 * decides which tokens are admissible and whether the current site is allowed to run tags at all.
 * The loader lives in `app/plugins/google-tags.client.ts`.
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
 * The slice of site context the eligibility gate reads.
 *
 * Every field is optional so a partially hydrated store fails closed rather than throwing.
 * `published` is the dmsm config's own `published` boolean (`siteStore.config.published`).
 * `redirect` is the site's configured redirect alias, a bare hostname, when dmsm has one
 * (`siteStore.config.redirect`); today no prod site has one.
 */
export interface GoogleTagSiteContext {
    env?: string;
    multiSiteCode?: string;
    siteCode?: string;
    published?: boolean;
    redirect?: string;
}

/**
 * Per multisite host template a site must match before any tag may load.
 *
 * Keyed by `multiSiteCode`. Today only `bl2` is served, and its production sites are reached at
 * `${siteCode}.chm-cbd.net`. The map is the extension point: adding a multisite means adding a
 * template here, never loosening the comparison. The match is exact, so no suffix or prefix
 * variant of the template is accepted.
 */
export const GOOGLE_TAG_HOSTS: Record<string, (siteCode: string) => string> = {
    bl2: (siteCode: string) => `${siteCode.toLowerCase()}.chm-cbd.net`,
};

/**
 * Reduces a candidate host to a bare, lower cased hostname suitable for an exact comparison.
 *
 * Used for the browser's `window.location.hostname` and for a site's configured `redirect`
 * alias. Both are expected to already be bare hostnames, but an HTTPS origin is accepted too so a
 * store getter that includes the scheme still normalises. Anything else fails closed with `null`:
 * a non HTTPS scheme, embedded credentials, an explicit port, a non root path, a query or a
 * fragment, or a bare string still carrying `/`, `@`, or `:`. That rejects host confusable input
 * such as `evil.test/real.chm-cbd.net` or a userinfo trick instead of quietly accepting it.
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
 * Decides whether the current site is allowed to run Google tags at all.
 *
 * Five conditions, all required, all failing closed:
 *
 * 1. `env` is `prod`, compared case insensitively. `prod` is the runtime token this deployment
 *    actually emits.
 * 2. `multiSiteCode` names an own property of {@link GOOGLE_TAG_HOSTS}. The lookup goes through
 *    `hasOwnProperty`, never a bare index, so a crafted `multiSiteCode` of `constructor` or
 *    `__proto__` cannot resolve to a prototype method and false positive. Adding a multisite is
 *    adding a template to that map and nothing else.
 * 3. `published` is strictly `true`. dmsm's own publish flag, not truthiness of some other field:
 *    a string `'true'`, `1`, or a missing value all fail closed.
 * 4. `browserHost`, the hostname the visitor's browser is actually on, equals either that
 *    multisite's template applied to `siteCode` (`<siteCode>.chm-cbd.net`, compared case
 *    insensitively) or the site's normalised `redirect` alias, when it has one.
 *
 * There is deliberately no comparison against the dmsm-configured host: `context-unified.ts`
 * always builds it as `${siteCode}.${baseHost}` (today `<siteCode>.bl2.chm-cbd.net`), so it can
 * never equal the public template and would make the gate impossible to pass. The browser
 * hostname is what actually gates eligibility now; it is an argument rather than a `window` read
 * so this module stays pure and unit testable, and `app/plugins/google-tags.client.ts` passes
 * `window.location.hostname`.
 *
 * A missing or non string `env`, `multiSiteCode`, or `siteCode`, a `published` that is not
 * strictly `true`, or a browser host that matches neither the template nor a normalised
 * `redirect`, returns `false`.
 */
export function isGoogleTagsSite(site?: GoogleTagSiteContext | null, browserHost?: string | null): boolean {
    if (!site || typeof site !== 'object') return false;

    const { env, multiSiteCode, siteCode, published, redirect } = site;

    if (typeof env !== 'string' || typeof multiSiteCode !== 'string' || typeof siteCode !== 'string') return false;
    if (env.toLowerCase() !== 'prod') return false;
    if (published !== true) return false;

    const multiSiteKey = multiSiteCode.toLowerCase();

    if (!Object.prototype.hasOwnProperty.call(GOOGLE_TAG_HOSTS, multiSiteKey)) return false;

    const expectedHost = GOOGLE_TAG_HOSTS[multiSiteKey]!(siteCode).toLowerCase();
    const actualBrowserHost = normalizeGoogleTagHost(browserHost);

    if (actualBrowserHost === null) return false;
    if (actualBrowserHost === expectedHost) return true;

    const redirectAlias = normalizeGoogleTagHost(redirect);

    return redirectAlias !== null && actualBrowserHost === redirectAlias;
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
