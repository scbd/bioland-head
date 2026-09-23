import { drupalPathPrefix } from '#shared/utils/drupal-path-prefix';
import { boundedTtlMap } from '../bounded-ttl-map.js';






export function nextUri ({ next } = {}){
    if(!next) return
    return next.href
}

export function removeLocalizationFromPath(ctx, path){

    const pathParts = path.split('/');

    const isLocalizedPath = ctx?.locales?.includes(pathParts[1]);

    return isLocalizedPath?   [ '', ...pathParts.slice(2) ].join('/')    :  pathParts.join('/');
}


 /**
 * Get site settings from Drupal (siteName and homePath) in a single call
 * Uncached version - used internally by cached wrapper
 */
async function _getSiteSettings (ctx) {
    const { apiKey }     = useRuntimeConfig()
    const host           = ctx.host || ctx.localizedHost
    const query          = { jsonapi_include: 1 };
    const uri            = `${host}/${encodeURIComponent(drupalPathPrefix(ctx.locale))}/jsonapi/site/site?api-key=${encodeURIComponent(apiKey)}`

    // A FetchError's message embeds the full URL, api-key included, and its data is the raw
    // response body; rethrow a redacted copy so no caller or nitro handler logs either.
    const resp = await $fetch(uri, $fetchBaseOptions({query})).catch((e) => {
        throw createError({ ...describeError(e), message: `Site settings fetch failed for ${ctx.siteCode} (${ctx.locale}): ${describeError(e).message}` })
    })

    // Drupal in maintenance mode (or a proxy error page) answers 200 with HTML. Caching
    // `{ siteName: undefined, homePath: undefined }` from that for 30 days breaks home
    // routing for every container, so refuse anything that is not a JSON:API document.
    if (!resp || typeof resp !== 'object' || !resp.data || typeof resp.data !== 'object')
        throw Object.assign(new Error(`Site settings response for ${ctx.siteCode} (${ctx.locale}) is not a JSON:API document`), { statusCode: 422 })

    const name = resp.data.name

    const settings = {
        siteName: name === '_' ? '' : name,
        homePath: resp?.data?.page_front
    }

    consola.debug(`Fetched site settings for ${ctx.siteCode} (${ctx.locale})`, settings);

    return settings
}

// A failed settings fetch (e.g. maintenance HTML) is never cached (BL-1065), so every render
// re-asked Drupal. Remember a 4xx or non-JSON:API answer per site + locale for 60s in process,
// then retry (BL-1122); never a 5xx or network error. The call carries only the api-key, never
// the visitor's session, so it is the same answer for every visitor.
const SITE_SETTINGS_FAILURE_TTL_MS = 60 * 1000;
const siteSettingsFailures         = boundedTtlMap(1000);

function siteSettingsKey({ env, multiSiteCode, siteCode, locale }) {
  if (!env || !multiSiteCode || !siteCode || !locale)
    throw new Error( `getSiteSettings cache key missing required context: env=${env}, multiSiteCode=${multiSiteCode}, siteCode=${siteCode}` );

  return `${multiSiteCode}:${siteCode}:${locale}`;
}

async function getSiteSettingsOrRecentFailure(ctx) {
  const key    = siteSettingsKey(ctx);
  const failed = siteSettingsFailures.get(key);

  // Store a redacted description (not the error object) and throw a fresh createError per
  // hit, tagged so the caller can log a memo hit differently from a real fetch failure.
  if (failed) {
    const err = createError(failed);
    err.remembered = true;
    throw err;
  }

  try {
    return await _getSiteSettings(ctx);
  } catch (e) {
    if (e?.statusCode >= 400 && e.statusCode < 500) siteSettingsFailures.set(key, describeError(e), SITE_SETTINGS_FAILURE_TTL_MS);
    throw e;
  }
}

/**
 * Cached version of getSiteSettings
 * Cache key: $env-$multiSiteCode-$siteCode
 */
export const getSiteSettings = defineCachedFunction(
  async (ctx, event) => {
    return await getSiteSettingsOrRecentFailure(ctx);
  },
  {
    maxAge: 60 * 60 * 24 * 30,
    name: 'get-site-settings',
    group: "context",
    swr: false,
    getKey: (ctx, event) => siteSettingsKey(ctx)
  }
);
