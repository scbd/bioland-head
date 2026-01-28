
export const useContentTypeMenus = async (ctx) => {
    try {
        await useDrupalLogin(ctx.siteCode);

        return makeTypeMap(await getAllContentTypeMenus(ctx), ctx);
    }
    catch (e) {
   
        consola.fail('useContentTypeMenus - upstream failure', e);


        return {};
    }
}

async function getContentMenus (ctx, drupalInternalId) {
    const   lengthMap               = { 2:3, 3:3, 4:6, 5:3, 8:7, 9:7, 10:6, 11:7, 12:3, 16:6 };
    const { localizedHost, locale } = ctx;

    const length         = lengthMap[drupalInternalId] || 20
    const langcodeFilter = getLangcodeFilterParams(locale)
    const filters        = `${getTypeFilterParams({ drupalInternalId })}${langcodeFilter}${getSortParams()}${getPaginationParams({rowsPerPage:length})}`
    const uri            = `${localizedHost}/jsonapi/index/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image${filters}`
    const method         = 'get';
    const headers        = { 'Content-Type': 'application/json' }


    try {
        const { data, meta } = await $fetch(uri, $fetchBaseOptions({ method, headers }))

        return { data: data?.map(mapThumbNails(ctx)), count: meta?.count }
    }
    catch (e) {
        consola.error('getContentMenus - upstream failure', { drupalInternalId, uri });

        return { data: [], count: 0 }
    }
};


/**
 * Builds the sort query string parameters for Drupal JSON:API content requests.
 * 
 * Applies a multi-level sort order:
 * 1. `sticky` - Sticky items first (DESC)
 * 2. `field_order` - Custom order field (ASC)
 * 3. `field_published` - Published date (DESC)
 * 4. `field_start_date` - Start date (DESC)
 * 5. `changed` - Last modified date (DESC)
 * 
 * @returns {string} URL-encoded query string for sort parameters (prefixed with `&`)
 * @example
 * // Returns: "&sort[sticky][path]=sticky&sort[sticky][direction]=DESC&..."
 * const sortParams = getSortParams();
 */
function getSortParams(){

    const direction  = 'DESC' 

    let sortQueryString = ''

    sortQueryString += `&sort[sticky][path]=sticky`
    sortQueryString += `&sort[sticky][direction]=${encodeURIComponent(direction)}`

    sortQueryString += `&sort[sort-order][path]=field_order`
    sortQueryString += `&sort[sort-order][direction]=ASC`

    sortQueryString += `&sort[sort-start][path]=field_start_date`
    sortQueryString += `&sort[sort-start][direction]=${encodeURIComponent(direction)}`

    sortQueryString += `&sort[sort-published][path]=field_published`
    sortQueryString += `&sort[sort-published][direction]=${encodeURIComponent(direction)}`

    sortQueryString += `&sort[sort-changed][path]=changed`
    sortQueryString += `&sort[sort-changed][direction]=${encodeURIComponent(direction)}`

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

/**
 * Builds the langcode filter query string parameters for Drupal JSON:API content requests.
 * Filters content to only return items matching the specified locale.
 * 
 * @param {string} locale - The locale to filter by (e.g., 'en', 'fr', 'es')
 * @returns {string} URL-encoded query string for langcode filter (prefixed with `&`)
 */
function getLangcodeFilterParams(locale) {
    if (!locale) return '';
    
    return `&filter[language][value]=${encodeURIComponent(locale)}`;
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

        if(item.slug) 
            map[item.slug?.slice(1)] = item;
        else
            map[slugify(item.plural)] = item;
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
      const isArray = Array.isArray(document?.field_attachments);
      const attachments = isArray
        ? document?.field_attachments?.filter(
            ({ type }) => type === "media--image"
          )
        : [];
      const hasAttachments = attachments?.length > 0;

      document.thumb = "/images/no-image.png";

      const {
        drupal_internal__nid,
        langcode,
        thumb,
        title,
        path,
        created,
        changed,
        field_start_date,
        field_published,
        field_tags,
        field_type_placement,
      } = document;

      const startDate = field_start_date || "";
      const published = field_published || "";
      // Example in your code context:
      const tags       = field_tags && typeof field_tags === 'string' ? field_tags.split(',') : [];
      const hasAlias   = path?.alias && mapLocaleFromDrupal(path.langcode) === ctx.locale;

      // Don't prepend locale here - the frontend's localePath() will handle localization
      const href = hasAlias
        ? path.alias
        : `/node/${drupal_internal__nid}`;

      if (!hasAttachments)
        return {
          langcode,
          thumb,
          title,
          href,
          created,
          changed,
          startDate,
          published,
          tags,
          contentTypeId: field_type_placement?.drupal_internal__tid,
          nid: drupal_internal__nid,
        };

      const { uri } = attachments[0]?.field_media_image || {};

      if (!uri)
        return {
          langcode,
          thumb,
          title,
          href,
          created,
          changed,
          startDate,
          published,
          tags,
          nid: drupal_internal__nid,
          contentTypeId: field_type_placement?.drupal_internal__tid,
        };

      document.thumb = `${ctx.host}${uri.url}`;

      return {
        thumb: document.thumb,
        title,
        href,
        created,
        changed,
        startDate,
        published,
        tags,
        nid: drupal_internal__nid,
        contentTypeId: field_type_placement?.drupal_internal__tid,
      };
    }
}

async function getAllContentTypeMenus(ctx){

    // consola.info('getAllContentTypeMenus - locale:', ctx.locale, 'localizedHost:', ctx.localizedHost);

    const isEnglish = ctx.locale === 'en';
    const terms     = isEnglish? await getTerms(ctx) : await Promise.all([getEnglishTerms(ctx), getTerms(ctx)]).then(([en, xx])=> [...en, ...xx]);
    
    // consola.info('getAllContentTypeMenus - raw terms count:', terms.length, 'terms:', terms.map(t => ({ id: t.drupalInternalId, lang: t.langcode, name: t.name })));

    // For non-English: deduplicate terms by drupalInternalId, preferring localized terms over English
    const dedupedTerms = isEnglish ? terms : deduplicateTerms(terms, ctx.locale);
    
    // consola.info('getAllContentTypeMenus - dedupedTerms count:', dedupedTerms.length);

    const requests  = [];

    for(const term of dedupedTerms){
        // Always fetch content for all terms - localizedHost handles locale filtering
        const aRequest = getContentMenus(ctx, term.drupalInternalId)
            .then(({ data, count }) => ({ ...term, data, count }))
            .catch((e) => {
                const { logAll, logServerOutRequests } = useRuntimeConfig().public || {}
                if (logAll || logServerOutRequests) {
                    consola.warn('getAllContentTypeMenus - term fetch failure', {
                        drupalInternalId: term.drupalInternalId,
                        error: e
                    })
                }

                return { ...term, data: [], count: 0 }
            })

        requests.push(aRequest);
    }

    const result = await Promise.all(requests);

  //  consola.warn('getAllContentTypeMenus - final result count:', result.length, 'with data:', result.filter(r => r.data?.length > 0).length);
    return result
}

function deduplicateTerms(terms, locale) {
    const termMap = new Map();
    
    for (const term of terms) {
        const id = term.drupalInternalId;
        const existing = termMap.get(id);
        
        // Prefer localized term over English term
        if (!existing || (existing.langcode === 'en' && term.langcode === locale)) {
            termMap.set(id, term);
        }
    }
    
    return Array.from(termMap.values());
}

function getEnglishTerms ({ host }) {
    return getTerms({ localizedHost:host+'/en', host })
}

async function getTerms ({ localizedHost}) {
    const uri           = `${localizedHost}/jsonapi/taxonomy_term/tags?jsonapi_include=1`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    try {
        const { data } = await $fetch(uri, $fetchBaseOptions({ method, headers }));

        return data
            .filter(({ status }) => status)
            .map(({ drupal_internal__tid: drupalInternalId, name, uuid, path, field_plural, langcode }) => ({
                drupalInternalTid: drupalInternalId,
                drupalInternalId,
                langcode: mapLocaleFromDrupal(langcode),
                name,
                slug: field_plural ? `/${slugify(field_plural)}` : path?.alias,
                plural: field_plural,
                uuid,
                hrefs: [name ? `/${slugify(name)}` : '', field_plural ? `/${slugify(field_plural)}` : ''].filter(x => x)
            }))
    }
    catch (e) {

        const { logAll, logServerOutRequests } = useRuntimeConfig().public || {}
        if (logAll || logServerOutRequests) {
            consola.warn('getTerms - upstream failure', { uri })
        }

        return []
    }
};
