export default defineEventHandler(async (event) => {
    try{
        const queryCtx = getQuery (event);

        const locales  = Array.isArray(queryCtx.locales)? queryCtx.locales : ([queryCtx.locales]);

        const ctx      = { ...queryCtx, locales };

        const result = await getStatus(ctx);

        consola.success(result)
        if(result?.counts?.total < 0) result.latestSeedConfiguration = false;

        return  result
    }
    catch (e) {
        passError(event, e);
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

        return $fetch(`${url}/${defaultLocale}`, $fetchBaseOptions())
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

        return $fetch(url+`/${locale}/jsonapi/index/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image&filter[language]=${locale}`, $fetchBaseOptions())
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


//http://lk.localhost:3000/api/chm-network/status?url=https://lk.bl2.cbddev.xyz&defaultLocale=en&locales=fr&locales=en