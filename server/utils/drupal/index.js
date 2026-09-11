





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
    const uri            = `${host}/${encodeURIComponent(ctx.locale)}/jsonapi/site/site?api-key=${encodeURIComponent(apiKey)}`

    const resp = await $fetch(uri, $fetchBaseOptions({query}))
    const name = resp?.data?.name

    const settings = {
        siteName: name === '_' ? '' : name,
        homePath: resp?.data?.page_front
    }

    consola.debug(`Fetched site settings for ${ctx.siteCode} (${ctx.locale})`, settings);

    return settings
}

/**
 * Cached version of getSiteSettings
 * Cache key: $env-$multiSiteCode-$siteCode
 */
export const getSiteSettings = defineCachedFunction(
  async (ctx, event) => {
    return await _getSiteSettings(ctx);
  },
  {
    maxAge: 60 * 60 * 24 * 30,
    name: 'get-site-settings',
    group: "context",
    swr: false,
    getKey: (ctx, event) => {
      const { env, multiSiteCode, siteCode, locale } = ctx;

      if (!env || !multiSiteCode || !siteCode || !locale)
        throw new Error( `getSiteSettings cache key missing required context: env=${env}, multiSiteCode=${multiSiteCode}, siteCode=${siteCode}` );

      return `${multiSiteCode}:${siteCode}:${locale}`;
    }
  }
);
