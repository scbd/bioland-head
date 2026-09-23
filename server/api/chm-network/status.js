import { drupalPathPrefix } from '#shared/utils/drupal-path-prefix';

const ENVS        = new Set(['dev', 'stg', 'prod']);
const SITE_CODE   = /^[a-z0-9-]{1,32}$/;
const LOCALE_CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

// The Site's host and locales come from DMSM, never from the query string: taking a raw URL let
// any caller make this server fetch an arbitrary (including internal) address (BL-1134).
export default defineEventHandler(async (event) => {
    const { siteCode, env } = getQuery(event);

    if (typeof env !== 'string' || !ENVS.has(env) || typeof siteCode !== 'string' || !SITE_CODE.test(siteCode))
        throw createError({ statusCode: 400, statusMessage: 'siteCode and env (dev|stg|prod) are required' });

    try{
        const ctx    = await resolveSite(siteCode, env);
        const result = await getStatus(ctx);

        if(result?.counts?.total < 0) result.latestSeedConfiguration = false;

        return  result
    }
    catch (e) {
        return passError(event, e);
    }

    async function resolveSite(siteCode, env){
        const { dmsm, multiSiteCode } = useRuntimeConfig().public;
        const { config, sites }       = await $fetch(`${dmsm}/config/${env}/${multiSiteCode}`, $fetchBaseOptions());
        const site                    = sites && Object.hasOwn(sites, siteCode) ? sites[siteCode] : null;

        if(!site) throw createError({ statusCode: 404, statusMessage: 'Unknown site' });

        const locales = (Array.isArray(site.locales) ? site.locales : [site.locales]).filter(isLocale);

        if(!isLocale(site.defaultLocale) || !locales.length)
            throw createError({ statusCode: 422, statusMessage: 'Site has no valid locales' });

        const url = getCanonicalHost({ siteCode: site.siteCode ?? siteCode, baseHost: config?.baseHost, env, redirect: site.redirect });

        return { url, defaultLocale: site.defaultLocale, locales, migration: !!(site.published && site.hasBl1) };
    }

    function isLocale(locale){
        return typeof locale === 'string' && LOCALE_CODE.test(locale);
    }

    async function getStatus(ctx){
        const siteUp = await isSiteUp(ctx)

        if(!siteUp) return { siteUp };

        const counts = await getAllCounts(ctx)

        if(!ctx?.migration) return { siteUp, counts };

        const [isMigrated, isTranslated] = await Promise.all([isMigratedFunc(ctx), isTranslatedFunc(ctx)]);

        return { siteUp, counts, isMigrated, isTranslated };
    }

    function getAllCounts(ctx){
        const { locales  } = ctx;



        return Promise.all(locales.map((locale) => getCount(ctx, locale)))
            .then((counts) => {
                const total = counts.reduce((a,b) => a + b, 0);
                const countsObj = {};

                for(let i = 0; i < counts.length; i++)
                    countsObj[locales[i]] = counts[i];
                
                return { locales:countsObj, total };
            })
            .catch(() => ({ counts: [], total: 0 }));
    }
    function isSiteUp({url, defaultLocale}){

        return $fetch(`${url}/${drupalPathPrefix(defaultLocale)}`, $fetchBaseOptions())
            .then((r) =>r.includes(testWord(defaultLocale)))
            .catch(() => false);
    }

    function testWord(locale){
        if(locale === 'fr') return 'Mécanisme de centre d’échange';
        if(locale === 'ar') return 'المقاصة';
        
        return 'Clearing House Mechanism';
    }
    async function isMigratedFunc(ctx, targetLocale){

        const count = await getCount(ctx, targetLocale);

        return count > 50;
    }

    function getCount({ url, defaultLocale }, targetLocale){
        const locale = targetLocale || defaultLocale || 'en';

        return $fetch(url+`/${drupalPathPrefix(locale)}/jsonapi/index/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image${buildDrupalLanguageFilter(locale)}`, $fetchBaseOptions())
        .then(({meta}) => Number(meta?.count)? Number(meta?.count): 0)
        .catch(() => -1);
    }

    async function isTranslatedFunc(ctx){
        const targetLocale = ctx.locales?.find((locale) => locale !== ctx.defaultLocale);
        
        if(!targetLocale) return true;

        const [a,b] = await Promise.all([getCount(ctx), getCount(ctx, targetLocale)]);

        return  Math.abs(a - b)? Math.abs(a - b)  < 5: false //Promise.all(counts)
            // .then(([defaultCount, targetCount]) => {
            //     if(!defaultCount || !targetCount) return false;
            //     if(defaultCount > 50 && targetCount > 50) return true;
            //     return false;
            // })
            // .catch(() => false);
    }
})
