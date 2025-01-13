import limax from 'limax';

export const useContentTypeMenus = async (ctx) => {
    await useDrupalLogin(ctx.siteCode);

    return  makeTypeMap(await getAllContentTypeMenus(ctx), ctx);
}

async function getContentMenus (ctx, drupalInternalId) {

    const { localizedHost } = ctx;

    const uri            = `${localizedHost}/jsonapi/node/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image&filter[taxonomy_term--tags][condition][path]=field_type_placement.drupal_internal__tid&filter[taxonomy_term--tags][condition][operator]=IN&filter[taxonomy_term--tags][condition][value][]=${encodeURIComponent(drupalInternalId)}&page[limit]=14&sort[sticky][path]=sticky&sort[sticky][direction]=DESC&sort[sort-changed][path]=created&sort[sort-changed][direction]=DESC`;
    const method         = 'get';
    const headers        = { 'Content-Type': 'application/json' };
    const { data, meta } = await $fetch(uri, { method, headers });

    return { data: data?.map(mapThumbNails(ctx)), count: meta?.count }
};

function makeTypeMap(data, ctx){
    const countries = Array.from(new Set(!ctx?.country? [ ...(ctx?.countries || [])] : [ ctx.country, ...(ctx?.countries || []) ]));
    const map       = {};

    for(const item of data){

        item.dataMap = {};
    
        for(const country of countries){
            if(!item.dataMap[country]) item.dataMap[country] = [];

            if(!item.data) continue;

            for(const doc of item.data) {
                if(!isInCountry(countries, country, doc)) continue;

                item.dataMap[country].push(doc);
            }
        }

        map[item.slug.slice(1)] = item;
    }

    return map;
}

function isInAllCountries(countries, doc){
    let inAll = true;
    let count = 0;
    for(const country of countries){
        if(doc.tags.includes(country)){
            inAll = false;
            count++;
        }
    }

    return inAll || count === countries.length;
}

function isInCountry(countries, country, doc){
    if(isInAllCountries(countries, doc)) return true;

    return doc.tags.includes(country);
}

function mapThumbNails(ctx){
    return (document)=>{

        const isArray        = Array.isArray(document?.field_attachments)
        const attachments    = isArray? document?.field_attachments?.filter(({ type })=> type === 'media--image') : []
        const hasAttachments = attachments?.length > 0;

        document.thumb  = '/images/no-image.png';

        const {  drupal_internal__nid, langcode, thumb, title, path, created, changed, field_start_date, field_published, field_tags } = document;

        const startDate  = field_start_date || '';
        const published  = field_published || '';
        const tags       = field_tags? field_tags.split(',') : [];
        const hasAlias   = path?.alias && path.langcode === ctx.locale;
        const localePath = ctx.locale === ctx.defaultLocale? '' : `/${ctx.locale}`;

        const href       = hasAlias? `${localePath}${path.alias}` : `${localePath}/node/${drupal_internal__nid}`;

        if(!hasAttachments) return { langcode, thumb, title, href, created, changed, startDate, published, tags };

        const { uri } = attachments[0]?.field_media_image || {};

        if(!uri) return { langcode, thumb, title, href, created, changed, startDate, published, tags  };

        document.thumb  = `${ctx.host}${uri.url}`

        return { thumb:document.thumb, title, href, created, changed, startDate, published, tags };
    }
}

async function getAllContentTypeMenus(ctx){
    const isEnglish = ctx.locale === 'en';
    const terms     = isEnglish? await getTerms(ctx) : await Promise.all([getEnglishTerms(ctx), getTerms(ctx)]).then(([en, xx])=> [...en, ...xx]);
    const requests  = [];

    for(const term of terms){
        if(!isEnglish && term.langcode === 'en') {
            requests.push((async () => term)())
            continue;
        }
        const aRequest = getContentMenus(ctx, term.drupalInternalId).then(( { data, count })=> ({ ...term, data, count }));

        requests.push(aRequest);
    }

    return Promise.all(requests);
}

function getEnglishTerms ({ host }) {
    return getTerms({ localizedHost:host+'/en', host })
}

async function getTerms ({ localizedHost}) {
    const uri           = `${localizedHost}/jsonapi/taxonomy_term/tags?jsonapi_include=1`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data } = await $fetch(uri, { method, headers });

    return data.filter(({ status })=> status)
                .map(({ drupal_internal__tid:drupalInternalId, name, uuid, path, field_plural, langcode })=> ({ drupalInternalId, langcode, name, slug:field_plural? `/${limax(field_plural)}`: path?.alias, plural: field_plural, uuid, hrefs:[path?.alias, field_plural?`/${limax(field_plural)}`:''].filter(x=>x)  }))
};

