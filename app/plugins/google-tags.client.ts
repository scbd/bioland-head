/**
 * Loads the site's configured Google tags, and only when it is allowed to.
 *
 * Two gates, both required, both re-evaluated on every change:
 *
 * - **Site eligibility** via the shared site gate in `shared/utils/google-tags.ts`: the deployment
 *   is `prod`, the multisite has a host template in `GOOGLE_TAG_HOSTS` (today only `bl2`), and both
 *   the site's configured host and the hostname the browser is actually on are exactly that
 *   template applied to its `siteCode`. No env var, no kill switch.
 * - **Visitor consent** via `useCookieControl().cookiesEnabledIds` containing `ga`. Every consent
 *   action in the module funnels through one writer (`CookieControl.vue setCookies`), which sets
 *   `cookiesEnabledIds`, so watching that ref catches grant, per category revoke, and decline all.
 *
 * Decision H-a, watch the store rather than read it once. `app/plugins/site.js` is universal and
 * re-fetches `/api/context/{site}/{locale}` on the client, overwriting the SSR hydrated Pinia
 * payload. A one shot read at plugin init would silently miss whatever that re-fetch carries.
 *
 * Decision H-b, no manual `page_view`. GA4 Enhanced Measurement already reports history change
 * navigation; emitting our own event on top would double count.
 *
 * Consent Mode defaults. The token grammar admits `AW-` and `DC-`, so an Ads or floodlight tag can
 * be configured on a site whose banner only ever promised analytics. Before any tag starts, every
 * advertising storage purpose is defaulted to `denied` and GTM containers are loaded with `npa`,
 * Google's no personalised advertising flag. `analytics_storage` is deliberately left alone: this
 * plugin only runs at all once the visitor has granted the `ga` category.
 *
 * Idempotency: `configured` records every tag ID that has received its `config` call, so repeated
 * watcher runs and in-app navigation never double configure a property. `@nuxt/scripts` dedupes by
 * `key || src` and runs a registry script's `clientInit` on first creation only, so the per
 * container `key` below is what keeps a second GTM container from colliding with the first.
 *
 * Cookie attributes are pinned, on two paths. `cookie_domain` (the exact current hostname) and
 * `cookie_path` (`/`) are pushed as a `set` before either loader runs, which is the only lever a
 * GTM only site has, and are also passed on every `config` call this plugin issues, because gtag
 * documents `set` as applying to subsequent *events* rather than to `config`. That is also why the
 * analytics registry is given a `scriptInput.src` instead of an `id`: with an `id` its own
 * `clientInit` emits a bare, unparameterised `config` for the first measurement ID, which would
 * leave that one property on `cookie_domain: auto`, i.e. the registrable domain shared with every
 * other tenant. Withholding the `id` keeps every `config` ours, without double configuring.
 *
 * Revoke contract. On a real consent withdrawal, in order: tell Google via a `consent` `update` to
 * `denied`, set the per property `ga-disable-<id>` opt out, purge every GA cookie we can name, wait
 * for cookie-control to persist its own decision, then reload once. This plugin is the single owner
 * of that reload, and it only reloads on a granted to revoked transition, never on a visit where
 * consent was never given. Losing eligibility or losing the tag IDs is not a consent withdrawal:
 * those silence Google (`consent` `update` plus `ga-disable-<id>`) and stop, because the store
 * re-initialises on every locale switch and a hard reload mid-session over a transient context
 * payload is a worse outcome than a silenced tag.
 */

type GtagFn = (...args: unknown[]) => void

interface GoogleTagWindow extends Window {
    gtag?: GtagFn
    [key: string]: unknown
}

/** Cookie name prefixes GA4, Google Ads, and Campaign Manager write on the current host. */
const GOOGLE_COOKIE_PREFIXES = ['_ga', '_gid', '_gat', '_gac_', '_gcl_'];

/**
 * The tag IDs that answer to a `ga-disable-<id>` opt out, GA4 and legacy Universal Analytics.
 *
 * `configured` also holds `GTM-`, `AW-`, and `DC-` IDs, which Google ignores on that flag and which
 * have no `_ga_<stream>` cookie to derive, so both are restricted to this set.
 */
const ANALYTICS_TAG_ID_PATTERN = /^(G|UA)-/;

/** Advertising storage purposes defaulted to `denied` before any tag starts. */
const DENIED_AD_CONSENT = {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
} as const;

/** How long to wait for cookie-control to write its own decision before reloading. */
const CONSENT_PERSISTENCE_TIMEOUT_MS = 1000;
const CONSENT_PERSISTENCE_POLL_MS = 50;

/**
 * Returns a `gtag` that is safe to call before any registry script has been created.
 *
 * Identical to the shim both `@nuxt/scripts` registries install in their own `clientInit`, and
 * deliberately non destructive: each registry re-uses an existing `window.dataLayer`, so a command
 * queued here stays at the front of the queue gtag.js or gtm.js drains once it loads. This is what
 * lets the cookie `set` be pushed before either loader runs, including on a GTM only site where
 * `onBeforeGtagStart` never fires.
 */
function ensureGtag(): GtagFn {
    const win = window as unknown as { dataLayer?: unknown[]; gtag?: GtagFn };

    if (!Array.isArray(win.dataLayer)) win.dataLayer = [];

    if (typeof win.gtag !== 'function') {
        win.gtag = function gtag() {
            win.dataLayer!.push(arguments);
        };
    }

    return win.gtag;
}

/** Reads one cookie value from `document.cookie`, or `undefined` when it is absent. */
function readCookie(name: string): string | undefined {
    return document.cookie
        .split('; ')
        .find((entry) => entry.startsWith(`${name}=`))
        ?.slice(name.length + 1);
}

/**
 * Expires one cookie both host only and with an explicit `Domain`, at `path=/`.
 *
 * GA writes host only cookies here because `cookie_domain` is pinned to `location.hostname`, but
 * an older visit could have left a cookie carrying an explicit domain, so both forms are cleared.
 */
function expireCookie(name: string): void {
    const expiry = 'Thu, 01 Jan 1970 00:00:00 GMT';

    document.cookie = `${name}=; expires=${expiry}; path=/`;
    document.cookie = `${name}=; expires=${expiry}; path=/; domain=${window.location.hostname}`;
}

/**
 * Waits, bounded, for cookie-control to finish writing its consent decision.
 *
 * Resolves as soon as `ncc_e` no longer lists `ga`, which covers both the decline all case (the
 * cookie is deleted outright) and the partial save case (the cookie is rewritten without `ga`).
 * Gives up after {@link CONSENT_PERSISTENCE_TIMEOUT_MS} rather than blocking the reload forever.
 */
async function waitForConsentPersistence(): Promise<void> {
    const deadline = Date.now() + CONSENT_PERSISTENCE_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const enabledIds = readCookie('ncc_e');

        if (!enabledIds || !enabledIds.split('~').includes('ga')) return;

        await new Promise((resolve) => setTimeout(resolve, CONSENT_PERSISTENCE_POLL_MS));
    }
}

export default defineNuxtPlugin({
    name: 'google-tags',
    dependsOn: ['site'],

    setup(nuxtApp) {
        const siteStore = useSiteStore(nuxtApp.$pinia);
        const { cookiesEnabledIds } = useCookieControl();

        const eligible = computed(() => isGoogleTagsSite({
            env: siteStore.env,
            multiSiteCode: siteStore.multiSiteCode,
            siteCode: siteStore.siteCode,
            host: siteStore.host,
        }, window.location.hostname));

        const consent = computed(() => Boolean(cookiesEnabledIds.value?.includes('ga')));
        const ids = computed(() => parseGoogleTagIds(siteStore.biolandSettings?.googleAnalyticsIds));

        let loaded = false;
        const configured = new Set<string>();

        function load(tagIds: GoogleTagIds): void {
            const { gtag, gtm } = tagIds;
            const cookieParams = { cookie_domain: window.location.hostname, cookie_path: '/' };

            // Before either loader: the only cookie lever a GTM only site has, since
            // `onBeforeGtagStart` never fires when no `G-`/`AW-`/`DC-`/`UA-` ID is configured.
            ensureGtag()('set', cookieParams);

            if (gtag.length) {
                const analytics = useScriptGoogleAnalytics({
                    // `src` rather than `id` on purpose: given an `id`, the registry's own
                    // `clientInit` emits a bare `config` for it, which would leave the first
                    // property on `cookie_domain: auto`, the registrable domain every tenant
                    // shares. Withholding it keeps every `config` below ours and parameterised.
                    scriptInput: { src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtag[0]!)}` },
                    onBeforeGtagStart: (g) => g('consent', 'default', { ...DENIED_AD_CONSENT }),
                });

                for (const id of gtag) {
                    if (configured.has(id)) continue;

                    analytics.proxy.gtag('config', id, cookieParams);
                    configured.add(id);
                }
            }

            for (const id of gtm) {
                if (configured.has(id)) continue;

                // Per container key. Without it every container collides on the registry's default
                // `googleTagManager` key and only the first one ever loads.
                useScriptGoogleTagManager({
                    id,
                    key: `gtm-${id}`,
                    npa: true,
                    onBeforeGtmStart: (g) => g('consent', 'default', { ...DENIED_AD_CONSENT }),
                });
                configured.add(id);
            }
        }

        /**
         * Tells Google to stop measuring, without touching cookies and without reloading.
         *
         * Shared by the consent withdrawal path and by the weaker eligibility loss path.
         */
        function silence(): void {
            const win = window as unknown as GoogleTagWindow;

            win.gtag?.('consent', 'update', {
                analytics_storage: 'denied',
                ...DENIED_AD_CONSENT,
            });

            for (const id of configured) {
                if (!ANALYTICS_TAG_ID_PATTERN.test(id)) continue;

                win[`ga-disable-${id}`] = true;
            }
        }

        async function revoke(): Promise<void> {
            silence();

            // GA4 writes its per stream cookie as `_ga_<measurement id minus the `G-` prefix>`.
            // Legacy `UA-` properties have no such cookie, and `GTM-`/`AW-`/`DC-` IDs would only
            // yield a name nothing ever wrote, so only `G-` is derived from.
            for (const id of configured) {
                if (id.startsWith('G-')) expireCookie(`_ga_${id.slice(2)}`);
            }

            const present = document.cookie
                .split('; ')
                .map((entry) => entry.split('=')[0] ?? '')
                .filter((name) => GOOGLE_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix)));

            for (const name of present) expireCookie(name);

            await waitForConsentPersistence();

            window.location.reload();
        }

        watch([ids, consent, eligible], ([tagIds, hasConsent, isEligible]) => {
            const hasIds = tagIds.gtag.length > 0 || tagIds.gtm.length > 0;
            const shouldLoad = isEligible && hasConsent && hasIds;

            if (shouldLoad) {
                // Unconditional, not `&& !loaded`: a measurement ID added in Drupal mid-session
                // would otherwise match neither branch and never be configured. `configured` makes
                // the call idempotent. The watcher fires outside the plugin's own call stack, and
                // both registry composables reach for useNuxtApp() and injectHead() internally.
                nuxtApp.runWithContext(() => load(tagIds));
                loaded = true;

                return;
            }

            // Transition only. Without the `loaded` guard a visitor who never consented would be
            // reloaded on their first page view.
            if (!loaded) return;

            loaded = false;

            // Only a real consent withdrawal earns the purge and the reload. Eligibility loss or a
            // context payload that momentarily drops the tag IDs is silenced in place instead:
            // `app/plugins/site.js` re-initialises the store on every locale switch, so reloading
            // there would throw the visitor out of their session over a transient response.
            if (!hasConsent) {
                void revoke();

                return;
            }

            silence();
        }, { immediate: true });
    },
});
