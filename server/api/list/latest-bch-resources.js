import { DateTime } from 'luxon';
import consola from 'consola';

/**
 * BCH Resources list API endpoint.
 *
 * Fetches the 10 latest BCH resources combining:
 * - Drupal content types: [15, 48, 43, 16, 6, 12]
 * - BCH index schemas: capacityBuildingInitiative, dnaSequence, modifiedOrganism, 
 *   laboratoryDetection, resource, organism
 *
 * @module server/api/list/latest-bch-resources
 *
 * @param {H3Event} event - The H3 event object containing request details
 * @returns {Promise<Array>} Array of 10 latest resource records sorted by date
 *
 * @example
 * // GET /api/list/latest-bch-resources
 *
 * @throws {Error} Passes any errors to the error handler via passError
 */
export default defineEventHandler(async (event) => {
    try {
        const ctx = await useRequestContext(event);
        const query = getQuery(event);
        
        // Override locale with query param if provided
        const locale = query.locale || ctx?.locale || 'en';
        const country = ctx?.country?.toUpperCase() || 'GT'; // Default to Guatemala for testing
        const siteCode = query.siteCode || ctx?.siteCode;

        const headers = {
            Cookie: `context=${encodeURIComponent(JSON.stringify(ctx || {}))};`,
        };

        // Context params for internal fetches
        const contextParams = { siteCode, locale };

        // Fetch both Drupal resources and BCH index resources in parallel
        const [drupalResources, bchResources] = await Promise.all([
            // Drupal content types for resources: [15, 48, 43, 16, 6, 12]
            $fetch(
                '/api/list/drupal',
                $fetchBaseOptions({
                    query: { ...contextParams, drupalInternalIds: [15, 48, 43, 16, 6, 12] },
                    method: 'get',
                    headers,
                })
            ).then((resp) => resp?.data || [])
             .catch((e) => {
                consola.error('[latest-bch-resources] Error fetching Drupal resources:', e?.message || e);
                return [];
            }),

            // BCH index schemas for resources
            fetchBchResources(ctx, locale, country)
                .catch((e) => {
                    consola.error('[latest-bch-resources] Error fetching BCH resources:', e?.message || e);
                    return [];
                }),
        ]);

        // Combine, sort by date, and return top 10
        const combined = [...(drupalResources || []), ...(bchResources || [])];
        const sorted = sortByDate(combined);
        
        return sorted.slice(0, 10);
    } catch (e) {
        passError(event, e);
    }
});

/**
 * Fetch BCH resources from the SCBD index
 */
async function fetchBchResources(ctx, locale, country) {
    const { gaiaApi } = useRuntimeConfig().public;
    const uri = `${gaiaApi}/v2013/index/select`;
    const textLocale = getIndexLocale(locale);
    
    // BCH resource schemas
    const schemas = [
        'capacityBuildingInitiative',
        'dnaSequence',
        'modifiedOrganism',
        'laboratoryDetection',
        'resource',
        'organism'
    ];

    const schemaFilter = schemas.map(s => `schema_s:${s}`).join(' OR ');

    const query = {
        df: `text_${textLocale}_txt`,
        fq: [
            '_state_s:public',
            `{!tag=schema}schema_s:(${schemas.join(' ')})`,
            '{!tag=version}(*:* NOT version_s:*)',
            `{!tag=schemaSub}(${schemaFilter})`,
            `{!tag=government}countryRegions_ss:(${country.toLowerCase()}) OR countryRegions_REL_ss:(${country.toLowerCase()})`,
            '{!tag=excludeSchemas}(*:* NOT schema_s : (submission))',
            'realm_ss:bch'
        ],
        q: "''",
        sort: 'updatedDate_dt desc',
        fl: `id,realm_ss, rec_date:updatedDate_dt, rec_creationDate:createdDate_dt, identifier_s, uniqueIdentifier_s, url_ss, government_s, schema_s, government_${textLocale}_t, schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i,rec_countryName:government_${textLocale}_t, rec_title:title_${textLocale}_t, rec_summary:summary_t, rec_type:type_${textLocale}_t, rec_meta1:meta1_${textLocale}_txt, rec_meta2:meta2_${textLocale}_txt, rec_meta3:meta3_${textLocale}_txt,rec_meta4:meta4_${textLocale}_txt,rec_meta5:meta5_${textLocale}_txt,symbol_s,startDate_dt,endDate_dt,eventCountry_CEN_s,title_s,eventCity_s,covers_ss,traitsDiseasesResistance_b,traitsHerbicidesResistance_b,traitsPhysiologyChanges_b,traitsQualityChanges_b,traitsMedicalProduction_b,traitsOther_b,scopeRelease_b,scopeFood_b,scopeFeed_b,scopeProcessing_b,scopeConfined_b,scopeContainedUse_b,scopeOther_b,scopePharmaceutical_b,scopeTransit_b,animals_b,bacteria_b,fungi_b,plants_b,viruses_b`,
        wt: 'json',
        start: 0,
        rows: 10,
        facet: true,
        'facet.field': [
            '{!ex=schemaType}schemaType_s',
            '{!ex=schema,schemaType,schemaSub}schema_s',
            '{!ex=government}countryRegions_ss',
            '{!ex=keywords}all_terms_ss',
            '{!ex=region}countryRegions_REL_ss'
        ],
        'facet.mincount': 1,
        'facet.limit': 512,
        'facet.pivot': 'schema_s, all_Terms_ss'
    };

    try {
        const { response } = await $fetch(uri, $fetchBaseOptions({
            mode: 'cors',
            method: 'post',
            body: JSON.stringify(query),
            headers: { 'Content-Type': 'application/json' }
        }));

        // Normalize and transform BCH records
        return (response?.docs || []).map(normalizeIndexKeys).map(cleanBchResourceRecord);
    } catch (error) {
        consola.error('[latest-bch-resources] BCH index request failed:', error.message);
        throw error;
    }
}

/**
 * Clean and normalize BCH resource record for card display
 */
function cleanBchResourceRecord(record) {
    return {
        ...record,
        href: record.urls?.[0] || record.url,
        title: record.recTitle || record.title,
        summary: record.recSummary || record.summary,
        changed: record.recDate || record.updatedDate,
        schema: record.schema,
        source: 'bch-index'
    };
}

/**
 * Sort records by date (most recent first)
 */
function sortByDate(data) {
    return data.sort((a, b) => {
        const aDate = DateTime.fromISO(
            a.changed || a.updatedDate || a.recDate || a.fieldPublished || a.fieldStartDate || a.startDate
        );
        const bDate = DateTime.fromISO(
            b.changed || b.updatedDate || b.recDate || b.fieldPublished || b.fieldStartDate || b.startDate
        );

        if (aDate > bDate) return -1;
        if (bDate > aDate) return 1;
        return 0;
    });
}

/**
 * Get locale code for index queries
 */
function getIndexLocale(locale) {
    return ['en', 'ar', 'es', 'fr', 'ru', 'zh'].includes(locale) 
        ? locale.toUpperCase() 
        : 'EN';
}
