import isString from 'lodash.isstring'

export const parseQuery = (event) => {
    const { locales, country, siteCode, identifier, locale, defaultLocale, countries: countriesArray } = getQuery(event);
    
    const countries      = (Array.isArray(countriesArray) && countriesArray?.length? countriesArray : country? [country]: []).filter(x=>x && x !== 'undefined');

    // const defaultLocale      =  !isPlainObject(defaultLocaleRaw)? JSON.parse(defaultLocaleRaw || {}).locale : defaultLocaleRaw.locale;
    const { baseHost, env }  = useRuntimeConfig().public;
    const pathPreFix         = getPathPrefix(locale, defaultLocale)
    const hasRedirect        = env === 'production' && redirect;
    const host               = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    const localizedHost      = `${host}${pathPreFix}`;
    const indexLocal         = getIndexLocale(locale);

    return removeNullProps({ locales, host, localizedHost, baseHost, country, countries,siteCode, identifier, locale, defaultLocale, pathPreFix, indexLocal  })
}

export const getContext = (event) => {
    const { context } = parseCookies(event)


    if(!context) return parseQuery(event)

    return context? parseContext(JSON.parse(decodeURIComponent(context))) : undefined
}

export function parseContext (context) {

    const ctx = isString(context)? JSON.parse(context) : context;

    const { locales, country, localizedHost:lh,siteCode, identifier, locale, defaultLocale, countries: countriesArray, redirect , path} = ctx;
    
    const   countries       = (Array.isArray(countriesArray) && countriesArray?.length? [country,...countriesArray] : country? [country] : []).filter(x=>x && x !== 'undefined');

    // const   defaultLocale   =  defaultLocale
    const { baseHost, env}  = useRuntimeConfig().public;
    const   pathPreFix      = getPathPrefix(locale, defaultLocale)
    const   hasRedirect     = env === 'production' && redirect;
    const   host            = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    const   localizedHost   = lh? lh : `${host}${pathPreFix}`;
    const   indexLocale     = getIndexLocale(locale);

    return removeNullProps({locales,  host, localizedHost, country,countries, siteCode, identifier, locale, defaultLocale, indexLocal:indexLocale, indexLocale, path })
}

export async function getSiteConfig({  siteCode }){

    const { multiSiteCode, env, dmsm } = useRuntimeConfig().public;

    const uri = `${dmsm}/config/${env}/${multiSiteCode}/${siteCode}`//`${gaiaApi}/v2023/drupal/multisite/${multiSiteCode}/configs/${identifier}`

    return $fetch(uri);
}

function getPathPrefix(locale, defaultLocale){
    if(!locale || !defaultLocale) return '';

    return locale === 'und' || locale === defaultLocale  ? '' : '/'+ drupalizeLocale(locale);
}

