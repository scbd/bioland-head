





export function nextUri ({ next } = {}){
    if(!next) return
    return next.href
}

export function removeLocalizationFromPath(ctx, path){

    const pathParts = path.split('/');

    const isLocalizedPath = ctx?.locales?.includes(pathParts[1]);

    return isLocalizedPath?   [ '', ...pathParts.slice(2) ].join('/')    :  pathParts.join('/');
}

export function drupalizeLocale(locale){
    // if(locale === 'zh') return 'zh-hans';

    return locale;
}

export async function getSiteDefinedName (ctx) {
    const { apiKey }     = useRuntimeConfig()
    const localizedHost  = getHost(ctx)
    const query          = { jsonapi_include: 1 };
    const uri            = `${localizedHost}/${ctx.locale}/jsonapi/site/site?api-key=${apiKey}`

    const resp = await $fetch(uri,{query})
    const name = resp?.data?.name

    return name === '_'? '' : name;
}

export async function getSiteDefinedHome (ctx) {
    const { apiKey }     = useRuntimeConfig()
    const localizedHost  = getHost(ctx)
    const query          = { jsonapi_include: 1 };
    const uri            = `${localizedHost}/jsonapi/site/site?api-key=${apiKey}`

    const resp = await $fetch(uri,{query})

    return resp?.data?.page_front
}

function getHost(ctx, ignoreLocale = false){
    const { baseHost, env }  = useRuntimeConfig().public;
    const { locale, identifier, siteCode,defaultLocale, config } = ctx;
    const   hasRedirect     = env === 'production' && config?.redirect;
    const pathLocale = ignoreLocale? '' : drupalizePathLocales(locale, defaultLocale);
    const base       = hasRedirect? `https://${config.redirect}` : `https://${encodeURIComponent(siteCode)}.${encodeURIComponent(baseHost)}`;

    return `${base}${pathLocale}`;
}

const drupalLocaleMap = new Map([['/zh','/zh']]);

function drupalizePathLocales(locale, defaultLocale){

    if(!defaultLocale || !locale) return '';

    const pathPreFix = locale === defaultLocale?.locale? `/${locale}` : `/${locale}`;

    if(!pathPreFix) return pathPreFix;

    const keys = drupalLocaleMap.keys();

    for (const aKey of keys)
        if(pathPreFix.startsWith(aKey))
            return pathPreFix.replace(aKey,drupalLocaleMap.get(aKey))

    return pathPreFix;
}