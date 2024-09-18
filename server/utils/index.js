

import c from 'consola';
import TimeAgo from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'
import { DateTime } from 'luxon';

import isNill from 'lodash.isnil';

TimeAgo.addDefaultLocale(en)


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






export function sortArrayOfObjectsByProp(a,b, prop){
    if(a[prop] < b[prop]) return -1; 
    if(a[prop] > b[prop]) return 1;

    return 0;
}
export async function getTimeStringFromIso(ctx, dateTimeIso){
    if(!dateTimeIso) return '';

    return getTimeAgo(ctx, DateTime.fromISO(dateTimeIso).toJSDate())
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
    const seconds = now.diff(lastCommentTime, 'minutes').toObject().seconds;

    const formatMap = { years:'y', months:'m', days:'d', hours:'h', minutes:'mins', seconds:'s' };
    const timeMap   = { years, months, days,  hours, minutes, seconds  };

    for (const key in timeMap)
        if( Math.floor(timeMap[key])) 
            return `${Math.floor(timeMap[key])}${formatMap[key]}`

}

export async function getTimeAgo(ctx,lastCommentTime){

    const timeAgo = await getTimeAgoService(ctx);

    return  timeAgo.format(lastCommentTime, 'mini')
}

async function getTimeAgoService(ctx){
    try {
        const { locale } = ctx;

        if(!locale || locale === 'en') return new TimeAgo('en');
        const { default: timeAgoLocale } = await import(`javascript-time-ago/locale/${locale}`);

        TimeAgo.addLocale(timeAgoLocale);

        return  new TimeAgo(locale);
    }catch(e){
        return new TimeAgo('en');
    }
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




function getHost(ctx, ignoreLocale = false){
    const { baseHost, env }  = useRuntimeConfig().public;
    const { locale, identifier, siteCode,defaultLocale, config } = ctx;
    const   hasRedirect     = env === 'production' && config?.redirect;
    const pathLocale = ignoreLocale? '' : drupalizePathLocales(locale, defaultLocale);
    const base       = hasRedirect? `https://${config.redirect}` : `https://${encodeURIComponent(siteCode)}.${encodeURIComponent(baseHost)}`;

    return `${base}${pathLocale}`;
}



export function nextUri ({ next } = {}){
    if(!next) return
    return next.href
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