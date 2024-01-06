
import isString from 'lodash.isstring'
import c from 'consola';

export const consola = c;
export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];

export const absMegaMenuSchemas = [ 'measure', 'absProcedure', 'absNationalModelContractualClause', 'absPermit', 'database', 'absCheckpoint']
export const bchMegaMenuSchemas = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert']

export const parseQuery = (event) => {
    const { country, identifier, locale, defaultLocale, countries: countriesArray } = getQuery(event);
    
    const countries      = countriesArray?.length? countriesArray : undefined;

    // const defaultLocale      =  !isPlainObject(defaultLocaleRaw)? JSON.parse(defaultLocaleRaw || {}).locale : defaultLocaleRaw.locale;
    const { baseHost, env }  = useRuntimeConfig().public;
    const pathPreFix         = getPathPrefix(locale, defaultLocale)
    const hasRedirect        = env === 'production' && redirect;
    const host               = hasRedirect? `https://${redirect}` : `https://${identifier}${baseHost}`;
    const localizedHost      = `${host}${pathPreFix}`;
    const indexLocal         = getIndexLocale(locale);

    return { host, localizedHost, baseHost, country, countries, identifier, locale, defaultLocale, pathPreFix, indexLocal  }
}

export const getContext = (event) => {
    const { context } = parseCookies(event)

    if(!context) return parseQuery(event)

    return context? parseContext(JSON.parse(decodeURIComponent(context))) : undefined
}

export function parseContext (context) {

    const ctx = isString(context)? JSON.parse(context) : context;

    const { country, localizedHost:lh, identifier, locale, defaultLocale, countries: countriesArray, redirect , path} = ctx;
    
    const   countries       = countriesArray?.length? [country,...countriesArray] : [country];
    // const   defaultLocale   =  defaultLocale
    const { baseHost, env } = useRuntimeConfig().public;
    const   pathPreFix      = getPathPrefix(locale, defaultLocale)
    const   hasRedirect     = env === 'production' && redirect;
    const   host            = hasRedirect? `https://${redirect}` : `https://${identifier}${baseHost}`;
    const   localizedHost   = lh? lh : `${host}${pathPreFix}`;
    const   indexLocale     = getIndexLocale(locale);

    return { host, localizedHost, country,countries,  identifier, locale, defaultLocale, indexLocal:indexLocale, indexLocale, path }
}

export function sortArrayOfObjectsByProp(a,b, prop){
    if(a[prop] < b[prop]) return -1; 
    if(a[prop] > b[prop]) return 1;

    return 0;
}

function getPathPrefix(locale, defaultLocale){
    if(!locale || !defaultLocale?.locale) return '';

    return locale === 'und' || locale === defaultLocale  ? '' : '/'+ drupalizeLocale(locale);
}

function drupalizeLocale(locale){
    if(locale === 'zh-hans') return 'zh-hans';

    return locale;
}


export async function getSiteDefinedName (ctx) {
    const { apiKey }     = useRuntimeConfig()
    const localizedHost  = getHost(ctx)
    const query          = { jsonapi_include: 1 };
    const uri            = `${localizedHost}/jsonapi/site/site?api-key=${apiKey}`


    const resp = await $fetch(uri,{query})
    const name = resp?.data?.name

    return name === '_'? '' : name;
}

export async function getSiteConfig({ identifier }){

    const { gaiaApi, drupalMultisiteIdentifier }  = useRuntimeConfig().public;

    const uri = `${gaiaApi}/v2023/drupal/multisite/${drupalMultisiteIdentifier}/configs/${identifier}`

    return $fetch(uri)
}


function getHost(ctx, ignoreLocale = false){
    const { baseHost, env }  = useRuntimeConfig().public;
    const { locale, identifier, defaultLocale, config } = ctx;
    const   hasRedirect     = env === 'production' && config?.redirect;
    const pathLocale = ignoreLocale? '' : drupalizePathLocales(locale, defaultLocale);
    const base       = hasRedirect? `https://${config.redirect}` : `https://${encodeURIComponent(identifier)}${encodeURIComponent(baseHost)}`;

    return `${base}${pathLocale}`;
}

const drupalLocaleMap = new Map([['/zh','/zh-hans']]);

function drupalizePathLocales(locale, defaultLocale){
    if(!defaultLocale?.locale || !locale) return '';

    const pathPreFix = locale === defaultLocale?.locale? '' : `/${locale}`;

    if(!pathPreFix) return pathPreFix;

    const keys = drupalLocaleMap.keys();

    for (const aKey of keys)
        if(pathPreFix.startsWith(aKey))
            return pathPreFix.replace(aKey,drupalLocaleMap.get(aKey))

    return pathPreFix;
}

export function nextUri ({ next } = {}){
    if(!next) return
    return next.href
}