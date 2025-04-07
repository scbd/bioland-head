
export const useContentTypeMenus = async (ctx) => {
    await useDrupalLogin(ctx.siteCode);

    return  makeTypeMap(await getAllContentTypeMenus(ctx), ctx);
}

async function getContentMenus (ctx, drupalInternalId) {
    const   lengthMap               = { 2:3, 3:3, 4:6, 5:3, 8:7, 9:7, 10:6, 11:7, 12:3, 16:6 };
    const { localizedHost, locale } = ctx;

    const length         = lengthMap[drupalInternalId] || 3;
    const filters        = `&filter[language]=${mapLocaleToDrupal(locale)}${getTypeFilterParams({ drupalInternalId })}${getSortParams()}${getPaginationParams({rowsPerPage:length})}`;
    const uri            = `${localizedHost}/jsonapi/index/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image${filters}`
    //`${localizedHost}/jsonapi/node/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image&filter[taxonomy_term--tags][condition][path]=field_type_placement.drupal_internal__tid&filter[taxonomy_term--tags][condition][operator]=IN&filter[taxonomy_term--tags][condition][value][]=${encodeURIComponent(drupalInternalId)}&page[limit]=14&sort[sticky][path]=sticky&sort[sticky][direction]=DESC&sort[sort-changed][path]=created&sort[sort-changed][direction]=DESC`;
    const method         = 'get';
    const headers        = { 'Content-Type': 'application/json' };

    // consola.error(uri)
    const { data, meta } = await $fetch(uri, $fetchBaseOptions({ method, headers }));

    return { data: data?.map(mapThumbNails(ctx)), count: meta?.count }
};
function getSortParams(){

    const direction  = 'DESC' ;

    let sortQueryString = '';

    sortQueryString += `&sort[sticky][path]=sticky`
    sortQueryString += `&sort[sticky][direction]=${encodeURIComponent(direction)}`

    sortQueryString += `&sort[promoted][path]=promote`
    sortQueryString += `&sort[promoted][direction]=${encodeURIComponent(direction)}`
    sortQueryString += `&sort[sort-published][path]=field_published`
    sortQueryString += `&sort[sort-published][direction]=${encodeURIComponent(direction)}`
    sortQueryString += `&sort[sort-start][path]=field_start_date`
    sortQueryString += `&sort[sort-start][direction]=${encodeURIComponent(direction)}`
    sortQueryString += `&sort[sort-created][path]=${encodeURIComponent('changed')}`
    sortQueryString += `&sort[sort-created][direction]=${encodeURIComponent(direction)}`

    return sortQueryString;
}

function getTypeFilterParams({ drupalInternalId, drupalInternalIds }){
    if((!drupalInternalIds || !drupalInternalIds?.length) && !drupalInternalId) return '';

    const filters =  Array.isArray(drupalInternalIds)? [...drupalInternalIds, drupalInternalId] : [drupalInternalId];

    let filterQueryString = '';

    filterQueryString += `&filter[tid][condition][path]=tid`
    filterQueryString += `&filter[tid][condition][operator]=IN`

    for(const filter of filters.filter(Boolean))
        filterQueryString += `&filter[tid][condition][value][]=${encodeURIComponent(filter)}`;


    return  filterQueryString;
}
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

        const {  drupal_internal__nid, langcode, thumb, title, path, created, changed, field_start_date, field_published, field_tags, field_type_placement } = document;

        const startDate  = field_start_date || '';
        const published  = field_published || '';
        const tags       = field_tags? field_tags.split(',') : [];
        const hasAlias   = path?.alias && mapLocaleFromDrupal(path.langcode) === ctx.locale;
        const localePath = ctx.locale === ctx.defaultLocale? '' : `/${ctx.locale}`;

        const href       = hasAlias? `${localePath}${path.alias}` : `${localePath}/node/${drupal_internal__nid}`;

        if(!hasAttachments) return { langcode, thumb, title, href, created, changed, startDate, published, tags, contentTypeId:field_type_placement?.drupal_internal__tid, nid:drupal_internal__nid  };

        const { uri } = attachments[0]?.field_media_image || {};

        if(!uri) return { langcode, thumb, title, href, created, changed, startDate, published, tags , nid:drupal_internal__nid , contentTypeId:field_type_placement?.drupal_internal__tid };

        document.thumb  = `${ctx.host}${uri.url}`

        return { thumb:document.thumb, title, href, created, changed, startDate, published, tags, nid:drupal_internal__nid, contentTypeId:field_type_placement?.drupal_internal__tid  };
    }
}

async function getAllContentTypeMenus(ctx){

    // consola.info('getAllContentTypeMenus', ctx);

    const isEnglish = ctx.locale === 'en';
    const terms     = isEnglish? await getTerms(ctx) : await Promise.all([getEnglishTerms(ctx), getTerms(ctx)]).then(([en, xx])=> [...en, ...xx]);
    const requests  = [];

    // const terms = await addAllAliases(ctx, termsRaw);

    for(const term of terms){
        if(!isEnglish && term.langcode === 'en') {
            requests.push((async () => term)());

            continue;
        }
        const aRequest = getContentMenus(ctx, term.drupalInternalId).then(( { data, count })=> ({ ...term, data, count }));

        requests.push(aRequest);
    }

    const result = await Promise.all(requests);

    // consola.warn(result)
    return result
}

function getEnglishTerms ({ host }) {
    return getTerms({ localizedHost:host+'/en', host })
}

async function getTerms ({ localizedHost}) {
    const uri           = `${localizedHost}/jsonapi/taxonomy_term/tags?jsonapi_include=1`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { data } = await $fetch(uri, $fetchBaseOptions({ method, headers }));

    return data.filter(({ status })=> status)
                .map(({ drupal_internal__tid:drupalInternalId, name, uuid, path, field_plural, langcode })=> ({ drupalInternalTid:drupalInternalId,drupalInternalId, langcode:mapLocaleFromDrupal(langcode), name, slug:field_plural? `/${slugify(field_plural)}`: path?.alias, plural: field_plural, uuid, hrefs:[name?`/${slugify(name)}`:'', field_plural?`/${slugify(field_plural)}`:''].filter(x=>x)  }))
};

