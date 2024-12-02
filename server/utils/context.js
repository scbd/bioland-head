import isString from 'lodash.isstring'

export const parseQuery = (event) => {
    const { locales:localesArray, country, siteCode, identifier, locale, defaultLocale, countries: countriesArray } = getQuery(event);

    const countries      = (Array.isArray(countriesArray) && countriesArray?.length? countriesArray : country? [country] : []).filter(x=>x && x !== 'undefined');
    const locales        = (Array.isArray(localesArray)? localesArray : [localesArray]).filter(x=>x && x !== 'undefined');;

    const { baseHost, env, multiSiteCode }  = useRuntimeConfig().public;

    const localeClean = sanitizeLocale(locale, defaultLocale)
    const pathPreFix         = getPathPrefix(localeClean, defaultLocale)
    const hasRedirect        = env === 'production' && redirect;
    const host               = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    const localizedHost      = `${host}${pathPreFix}`;
    const indexLocal         = getIndexLocale(localeClean);
    const key                = `context-${env}-${multiSiteCode}-${siteCode}-${localeClean}`;
    const ctx                = removeNullProps({ key, env, multiSiteCode, locales, host, localizedHost, country, countries, siteCode, identifier, locale:localeClean, defaultLocale, indexLocal });

    if(!ctx.siteCode) return {};

    useStorage('db').setItem(key, ctx);

    return ctx;
}


export const getContext = (event, key) => {
    const { context:cookieContext } = parseCookies(event)

    const context = cookieContext? JSON.parse(decodeURIComponent(cookieContext)) : {}

    if(!context?.siteCode ) return { ...parseQuery(event), event }

    return context? { ...parseContext(context), event} : undefined
}

export function parseContext (context) {
    const ctx = isString(context)? JSON.parse(context) : context;

    const { locales, country, localizedHost:lh,siteCode, identifier, locale, defaultLocale, countries: countriesArray, redirect , path} = ctx;
    
    const   countries       = (Array.isArray(countriesArray) && countriesArray?.length? [country,...countriesArray] : country? [country] : []).filter(x=>x && x !== 'undefined');

    const localeClean = sanitizeLocale(locale, defaultLocale)
    // const   defaultLocale   =  defaultLocale
    const { baseHost, env, multiSiteCode}  = useRuntimeConfig().public;
    const   pathPreFix      = getPathPrefix(localeClean , defaultLocale)
    const   hasRedirect     = env === 'production' && redirect;
    const   host            = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    const   localizedHost   = lh? lh : `${host}${pathPreFix}`;
    const   indexLocale     = getIndexLocale(localeClean );
    const key                = `context-${env}-${multiSiteCode}-${siteCode}-${localeClean }`;

    const ctxClean = removeNullProps({ key, env, multiSiteCode, locales, host, localizedHost, country, countries, siteCode, identifier, locale:localeClean,   defaultLocale, indexLocal:indexLocale, indexLocale, path })

    if(!ctxClean.siteCode) return {}

    useStorage('db').setItem(key, ctxClean);

    return ctxClean //removeNullProps({key, multiSiteCode, locales,  host, localizedHost, country,countries, siteCode, identifier, locale, defaultLocale, indexLocal:indexLocale, indexLocale, path })
}
function sanitizeLocale(locale, defaultLocale = 'en'){

        
    const { locales} = useRuntimeConfig().public;
    const   preFixes = locales.map(({ code })=> code);

    const isValid = preFixes.includes(locale)

    if(!isValid) return defaultLocale

    return locale;
}
export async function getSiteConfig({  siteCode }){

    try{
        const { multiSiteCode, env, dmsm } = useRuntimeConfig().public;

        const uri = `${dmsm}/config/${env}/${multiSiteCode}/${siteCode}`

        return $fetch(uri);
    }catch(e){
        const { multiSiteCode, env, dmsm } = useRuntimeConfig().public;
        const uri = `${dmsm}/config/${env}/${multiSiteCode}/${siteCode}`;
        
        console.error(e)
        throw createError({ 
            statusCode: 404, 
            statusMessage: 'Not Found',
            message: `Server.utils.context.getSiteConfig: no context derived ${uri}`,
            data:e
        })
    }
}

function getPathPrefix(locale, defaultLocale){
    if(!locale || !defaultLocale) return '';

    return locale === 'und' || locale === defaultLocale  ? `/${defaultLocale}` : '/'+ sanitizeLocale(locale, defaultLocale);
}

