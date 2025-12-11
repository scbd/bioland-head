import isString from 'lodash.isstring'

/**
 * @deprecated Use useRequestContext from context-unified.ts instead
 * This file is kept for backwards compatibility during migration
 */

export const parseQuery = (event) => {
    console.warn('[DEPRECATED] parseQuery is deprecated. Use useRequestContext() instead.')
    const { locales:localesArray, country, siteCode, identifier, locale, defaultLocale, countries: countriesArray } = getQuery(event);

    const countries      = (Array.isArray(countriesArray) && countriesArray?.length? countriesArray : country? [country] : []).filter(x=>x && x !== 'undefined');
    const locales        = (Array.isArray(localesArray)? localesArray : [localesArray]).filter(x=>x && x !== 'undefined');

    const { baseHost, env, multiSiteCode }  = useRuntimeConfig().public;

    const localeClean        = sanitizeLocale(locale, defaultLocale);
    const pathPreFix         = getPathPrefix(localeClean, defaultLocale);
    const hasRedirect        = env === 'production' && redirect;
    const host               = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    const localizedHost      = `${host}${pathPreFix}`;
    const indexLocal         = getIndexLocale(localeClean);
    const key                = `context-${env}-${multiSiteCode}-${siteCode}-${localeClean}`;
    const ctx                = removeNullPropsFromPlainObject({ key, env, multiSiteCode, locales, host, localizedHost, country, countries, siteCode, identifier, locale:localeClean, defaultLocale, indexLocal });

    if(!ctx.siteCode) return {};

    useStorage('db').setItem(key, ctx);

    return ctx;
}

export const getContext = (event, key) => {
    console.warn('[DEPRECATED] getContext is deprecated. Use useRequestContext() instead.')
   
    const { context:cookieContext } = parseCookies(event);
    const   queryParams = getQuery(event);
    
    const   context = cookieContext? parseJson(decodeURIComponent(cookieContext)) || {} : {};

    if(!context?.siteCode ) return { ...parseQuery(event), event };

    // Use path from query params if available (more current than cookie path)
    // This ensures locale is derived from the actual request path, not stale cookie
    const pathFromQuery = queryParams?.path;
    const contextWithPath = pathFromQuery ? { ...context, path: pathFromQuery } : context;

    return contextWithPath? { ...parseContext(contextWithPath), event } : undefined;
}

export function parseContext (context) {
    console.warn('[DEPRECATED] parseContext is deprecated. Use useRequestContext() instead.')
    const ctx = isString(context)? JSON.parse(context) : context;

    const { locales, country, localizedHost:lh, siteCode, identifier, locale, defaultLocale, countries: countriesArray, redirect, path } = ctx;
    
    const   countries       = (Array.isArray(countriesArray) && countriesArray?.length? [country,...countriesArray] : country? [country] : []).filter(x=>x && x !== 'undefined');
    
    // If path contains a locale prefix, use that locale instead of the cookie's cached locale
    // This fixes the 404 issue when reloading a page with a different locale in the URL
    const   pathLocale      = path ? extractLocaleFromPath(path, locales) : null;
    const   effectiveLocale = pathLocale || locale;
    const   localeClean     = sanitizeLocale(effectiveLocale, defaultLocale);

    const { baseHost, env, multiSiteCode }  = useRuntimeConfig().public;

    const   pathPreFix      = getPathPrefix(localeClean , defaultLocale);
    const   hasRedirect     = env === 'production' && redirect;
    const   host            = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    // Always recalculate localizedHost based on the current locale
    // Don't trust the cached lh as it may have been set with a different locale
    const   localizedHost   = `${host}${pathPreFix}`;
    const   indexLocale     = getIndexLocale(localeClean );
    const   key             = `context-${env}-${multiSiteCode}-${siteCode}-${localeClean}`;
    const   isBchSite       = baseHost.includes('bch') || host.includes('biosafety') || host.includes('bsl');

    // Note: path is NOT included in context - it should be passed explicitly to functions that need it
    const ctxClean = removeNullPropsFromPlainObject({ key, isBchSite, env, multiSiteCode, locales, host, localizedHost, country, countries, siteCode, identifier, locale:localeClean, defaultLocale, indexLocal:indexLocale, indexLocale });

    if(!ctxClean.siteCode) return {};

    useStorage('db').setItem(key, ctxClean);

    return ctxClean;
}

/**
 * Extract locale from path if it starts with a valid locale prefix
 * @param {string} path - The URL path (e.g., "/es/buscar")
 * @param {string[]} locales - Array of valid locale codes from site config
 * @returns {string|null} The locale code or null if not found
 */
function extractLocaleFromPath(path, locales) {
    if (!path || !locales) return null;
    
    const pathParts = path.split('/');
    const potentialLocale = pathParts[1];
    
    if (!potentialLocale) return null;
    
    // Check against site locales if available
    if (Array.isArray(locales) && locales.includes(potentialLocale)) {
        return potentialLocale;
    }
    
    // Fallback: check against runtime config locales
    const { locales: runtimeLocales } = useRuntimeConfig().public;
    const validCodes = runtimeLocales?.map(({ code }) => code) || [];
    
    return validCodes.includes(potentialLocale) ? potentialLocale : null;
}

export async function fetchSiteConfig({ siteCode }) {

    try{
        const { multiSiteCode, env, dmsm } = useRuntimeConfig().public;

        const uri = `${dmsm}/config/${encodeURIComponent(env)}/${encodeURIComponent(multiSiteCode)}/${encodeURIComponent(siteCode)}`;

        // consola.debug(`Server.utils.context.fetchSiteConfig: fetching site config from ${uri}`);   
        const result = await $fetch(uri);
        // consola.debug(`Server.utils.context.fetchSiteConfig:`, result);
        return result;
    }catch(e){
        const { multiSiteCode, env, dmsm } = useRuntimeConfig().public;
        const uri = `${dmsm}/config/${encodeURIComponent(env)}/${encodeURIComponent(multiSiteCode)}/${encodeURIComponent(siteCode)}`;
        throw createError({ 
            statusCode: 404, 
            statusMessage: 'Not Found',
            message: `Server.utils.context.fetchSiteConfig: no context derived ${uri}`,
            data:e
        });
    }
}

export function getCountryCode({ country, countries }={ country, countries:[] }){

    if(country) return country;

    if(!countries?.length) throw createError('Server.utils.context.getCountryCode: no country or countries provided by context');
    const index = Math.floor(Math.random() * countries.length);

    return countries[index];
}

function getPathPrefix(locale, defaultLocale){
    if(!locale || !defaultLocale) return '';

    return locale === 'und' || locale === defaultLocale  ? `/${defaultLocale}` : '/'+ sanitizeLocale(locale, defaultLocale);
}

function sanitizeLocale(locale, defaultLocale = 'en'){
    const { locales } = useRuntimeConfig().public;
    const   preFixes  = locales.map(({ code })=> code);
    const   isValid   = preFixes.includes(locale);

    if(!isValid) return defaultLocale;

    return locale;
}
