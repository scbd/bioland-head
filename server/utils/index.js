
import isString from 'lodash.isstring'
import c from 'consola';
import crypto from 'crypto';
import { DateTime } from 'luxon';
import clone from 'lodash.clonedeep';
import isNill from 'lodash.isnil';

export const consola = c;
export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];

export const absMegaMenuSchemas = [ 'measure', 'absProcedure', 'absNationalModelContractualClause', 'absPermit', 'database', 'absCheckpoint']
export const bchMegaMenuSchemas = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert']

export function uniqueObjects(passedArray){
    return Array.from(new Set(passedArray.map(e => JSON.stringify(e)))).map(e => JSON.parse(e));
}

export function removeNullProps(obj){
    for (const key in obj) {
        if(isNill(obj[key])) delete obj[key];
    }

    return obj;
}


export const getKey =  (event) => {
    const { context } = parseCookies(event)
    const query       = getQuery(event)
    const { pathname } = new URL(getRequestURL(event))
    const locale = query?.locale || context?.locale || 'und'
    const host   = query?.host || context?.host 
    const makeHash = (x) => crypto.createHash('sha1').update(x).digest('hex')
    const hashData = `${host}-${locale}-${pathname}` + JSON.stringify({...context, ...query});

    return `${host}-${locale}-${pathname}-${makeHash(hashData)}`
}

export const parseQuery = (event) => {
    const { country, siteCode, identifier, locale, defaultLocale, countries: countriesArray } = getQuery(event);
    
    const countries      = (Array.isArray(countriesArray) && countriesArray?.length? countriesArray : country? [country]: []).filter(x=>x && x !== 'undefined');

    // const defaultLocale      =  !isPlainObject(defaultLocaleRaw)? JSON.parse(defaultLocaleRaw || {}).locale : defaultLocaleRaw.locale;
    const { baseHost, env }  = useRuntimeConfig().public;
    const pathPreFix         = getPathPrefix(locale, defaultLocale)
    const hasRedirect        = env === 'production' && redirect;
    const host               = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    const localizedHost      = `${host}${pathPreFix}`;
    const indexLocal         = getIndexLocale(locale);

    return removeNullProps({ host, localizedHost, baseHost, country, countries,siteCode, identifier, locale, defaultLocale, pathPreFix, indexLocal  })
}

export const getContext = (event) => {
    const { context } = parseCookies(event)


    if(!context) return parseQuery(event)

    return context? parseContext(JSON.parse(decodeURIComponent(context))) : undefined
}

export function parseContext (context) {

    const ctx = isString(context)? JSON.parse(context) : context;

    const { country, localizedHost:lh,siteCode, identifier, locale, defaultLocale, countries: countriesArray, redirect , path} = ctx;
    
    const   countries       = (Array.isArray(countriesArray) && countriesArray?.length? [country,...countriesArray] : country? [country] : []).filter(x=>x && x !== 'undefined');

    // const   defaultLocale   =  defaultLocale
    const { baseHost, env}  = useRuntimeConfig().public;
    const   pathPreFix      = getPathPrefix(locale, defaultLocale)
    const   hasRedirect     = env === 'production' && redirect;
    const   host            = hasRedirect? `https://${redirect}` : `https://${siteCode}.${baseHost}`;
    const   localizedHost   = lh? lh : `${host}${pathPreFix}`;
    const   indexLocale     = getIndexLocale(locale);

    return removeNullProps({ host, localizedHost, country,countries, siteCode, identifier, locale, defaultLocale, indexLocal:indexLocale, indexLocale, path })
}

export function sortArrayOfObjectsByProp(a,b, prop){
    if(a[prop] < b[prop]) return -1; 
    if(a[prop] > b[prop]) return 1;

    return 0;
}
export function getTimeStringFromIso(dateTimeIso){
    if(!dateTimeIso) return '';

    return getTimeString(DateTime.fromISO(dateTimeIso))
}

export function getTimeStringFromSeconds(seconds){
    if(!seconds) return '';

    return getTimeString(DateTime.fromSeconds(seconds))
}

export function getTimeString(lastCommentTime){

    const now             = DateTime.now();
    // const lastCommentTime = DateTime.fromSeconds(timeStamp);
    
    const years   = now.diff(lastCommentTime, 'years').toObject().years;
    const months  = now.diff(lastCommentTime, 'months').toObject().months;
    // const weeks   = now.diff(lastCommentTime, 'months').toObject().weeks;
    const days    = now.diff(lastCommentTime, 'days').toObject().days;
    const hours   = now.diff(lastCommentTime, 'hours').toObject().hours;
    const minutes = now.diff(lastCommentTime, 'minutes').toObject().minutes;

    const formatMap = { years:'y', months:'m', days:'d', hours:'h', minutes:'mins' };
    const timeMap   = { years, months, days,  hours, minutes  };

    for (const key in timeMap)
        if( Math.floor(timeMap[key])) 
            return `${Math.floor(timeMap[key])}${formatMap[key]}`

}
function getPathPrefix(locale, defaultLocale){
    if(!locale || !defaultLocale) return '';

    return locale === 'und' || locale === defaultLocale  ? '' : '/'+ drupalizeLocale(locale);
}

export function removeLocalizationFromPath(ctx, path){

    const pathParts = path.split('/');

    const isLocalizedPath = pathParts[1] === ctx.locale;

    return isLocalizedPath?   [ '', ...pathParts.slice(2) ].join('/')    :  pathParts.join('/');
}
function drupalizeLocale(locale){
    if(locale === 'zh') return 'zh-hans';

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

export async function getSiteDefinedHome (ctx) {
    const { apiKey }     = useRuntimeConfig()
    const localizedHost  = getHost(ctx)
    const query          = { jsonapi_include: 1 };
    const uri            = `${localizedHost}/jsonapi/site/site?api-key=${apiKey}`


    const resp = await $fetch(uri,{query})



    return resp?.data?.page_front
}

export async function getSiteConfig({  siteCode }){

    const { multiSiteCode, env, dmsm } = useRuntimeConfig().public;

    const uri = `${dmsm}/config/${env}/${multiSiteCode}/${siteCode}`//`${gaiaApi}/v2023/drupal/multisite/${multiSiteCode}/configs/${identifier}`

    return $fetch(uri);
}


function getHost(ctx, ignoreLocale = false){
    const { baseHost, env }  = useRuntimeConfig().public;
    const { locale, identifier, siteCode,defaultLocale, config } = ctx;
    const   hasRedirect     = env === 'production' && config?.redirect;
    const pathLocale = ignoreLocale? '' : drupalizePathLocales(locale, defaultLocale);
    const base       = hasRedirect? `https://${config.redirect}` : `https://${encodeURIComponent(siteCode)}.${encodeURIComponent(baseHost)}`;

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