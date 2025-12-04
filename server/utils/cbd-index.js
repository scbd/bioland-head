import { DateTime     } from 'luxon' ; 
import isEmpty from 'lodash.isempty';
const indexUri = '/v2013/index/select?';

const getIndexCountryQuery = ({ countries, country } = {}) => {
    return cleanCountries({ countries, country }).map((s)=>`${s.toLowerCase()}`).join('+');
}

export const $indexFetch = async (queryString) => {
    const { gaiaApi }   = useRuntimeConfig().public;
    const   method      = 'get';
    const   headers     = { 'Content-Type': 'application/json' };
    const { response }  = await $fetch(gaiaApi+indexUri+queryString, $fetchBaseOptions({ method, headers }));

    response.docs       = response.docs.map(normalizeIndexKeys);

    return response;
};

export const getIndexLocale = (locale) => ['en', 'ar', 'es', 'fr', 'ru', 'zh'].includes(locale)? locale.toLocaleUpperCase() : 'EN';

export const getIndexQuery = (s, { countries, country } = {}) => {

    const schema = Array.isArray(s)? s.map((aSchema)=>`schema_s:${aSchema}`).join('+OR+'): `schema_s:${s}`;
    const countryQueryString = getIndexCountryQuery({ countries, country });

    return countryQueryString? `q=(${schema})+AND+government_s:(${countryQueryString})`:`q=(${schema})`; //NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+
}

export const getIndexFocalPointTypesFields = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = [
                    `type_${locale}_txt`,
                    'hostGovernments_ss',
                    `type_ss`,
                    'url_ss',
                ];

    return `fl=${fields.join(',')}`;
}

export const getIndexFocalPointTypesFieldsFull = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = ['firstName_s',
                    'lastName_s',
                    'title_s',
                    `title_${locale}_s`,
                    `description_${locale}_s`,
                    `salutation_${locale}_s`,
                    `address_${locale}_s`,
                    `function_${locale}_s`,
                    `department_${locale}_s`,
                    `organization_${locale}_s`,
                    `government_${locale}_s`,
                    `thematicArea_${locale}_ss`,
                    'thematicArea_ss',
                    `addressCountry_${locale}_s`,
                    `thematicArea_C${locale}_ss`,
                    `type_C${locale}_ss`,
                    'email_ss',
                    'telephone_ss',
                    `type_${locale}_txt`,
                    'hostGovernments_ss',
                    `type_ss`,
                    'url_ss',
                ];

    return `fl=${fields.join(',')}`;
}
export const getIndexNrFields = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = [
                    `title_${locale}_s`,
                    `reportType_${locale}_s`,
                    `reportType_C${locale}_s`,
                    'hostGovernments_ss',
                    'url_ss',
                    'createdDate_dt',
                ];

    return `fl=${fields.join(',')}`;
}

export const normalizeIndexKeys = (obj) => {
    const newObj = {};

    for (const key in obj) {
            const newKey = key
                            .replace(/_[A-Z]{2}_txt/, 'Texts')
                            .replace(/_[A-Z]{2}_ss/, 's')
                            .replace(/_ss/, 's')
                            .replace(/_[A-Z]{2}_s/, '')
                            .replace(/_[A-Z]{2}_t/, '')
                            .replace('_s', '')
                            .replace('_t', '')
                            .replace(/_dt/, '');

            
            newObj[newKey] = obj[key];

            if(newKey==='urls' && newObj?.urls?.length)
                newObj.url = newObj.urls[0];

            if(newKey==='realms')
                newObj.realms = Array.from(new Set(newObj.realms.map((realm)=>realm.toLocaleUpperCase())))
    }

    const tags = {}
    if(obj?.government_s) tags.countries = [{identifier :obj.government_s}];
    if(obj?.countryRegions_ss) tags.countries = obj.countryRegions_ss.map((country)=>({ identifier :country}));

    if(obj?.globalTargetAlignment_ss?.length) tags.gbfTargets = obj.globalTargetAlignment_ss.map((target)=>({ identifier :target}));
    if(obj?.globalTargetAlignment_REL_ss?.length) tags.sdgs = obj.globalTargetAlignment_REL_ss.filter((x)=>x.includes('-GOAL-')).map((target)=>sdgsData.find(({identifier})=>(identifier===target.replace('SUSTAINABLE-DEVELOPMENT-', 'SDG-'))))
        // { identifier :target.replace('SUSTAINABLE-DEVELOPMENT-', 'SDG-')}));
    
    return {...newObj, ...obj, tags};
}

export const getAllBySchemas = defineCachedFunction((ctx, schemas, countries=[]) => queryScbdIndex ({ ...ctx, schemas, countries,rowsPerPage: 5000 }),{
    maxAge: 60 * 60 * 60 * 24 * 30,
    getKey:(ctx, schemas, countries=[]) => `${ctx.env}-${ctx.multiSiteCode}-${ctx.siteCode}-${ctx.locale}-${JSON.stringify(schemas||[])}-${JSON.stringify(countries||[])}`,
    base:'external'
});

/**
 * Query the SCBD (Secretariat of the Convention on Biological Diversity) index API
 * 
 * @param {Object} ctx - Context object containing site, locale, and query parameters
 * @param {Object} [queryBody] - Optional pre-constructed query body object. If provided, overrides ctx-based query generation
 * @param {boolean} [isBch=false] - If true, uses BCH-specific query builder; otherwise uses general query builder
 * @returns {Promise<Object>} Response object containing data array, count, and facetCounts
 * @throws {Error} If the index API request fails
 * 
 * @example
 * // Query with context for general CBD data
 * const result = await queryScbdIndex(ctx);
 * 
 * @example
 * // Query with context for BCH-specific data
 * const bchResult = await queryScbdIndex(ctx, null, true);
 * 
 * @example
 * // Query with custom query body
 * const customResult = await queryScbdIndex(ctx, { q: 'custom query', rows: 100 });
 */
export const queryScbdIndex = async (ctx, queryBody={}, isBch = false, isAbs = false) => {
    const { gaiaApi }   = useRuntimeConfig().public;
    const   uri         = `${gaiaApi}/v2013/index/select`;

    const body = !isEmpty(queryBody)? JSON.stringify(queryBody) : (isBch ? getAllBchQuery(ctx) : getAllQuery(ctx));

    try {
        const { response, facet_counts: facetCounts } = await $fetch(uri,  $fetchBaseOptions({ mode: 'cors' , method:'post', body, headers: {'Content-Type': 'application/json'}}));

        response.data  = response.docs.map(normalizeIndexKeys)//.filter(({ title, summary })=> (title && summary));
        response.count = response.numFound;

        delete response.docs;

        return { ...response, facetCounts, facet_counts:facetCounts };
    } catch (error) {
        consola.error('=== SCBD Index Request Failed ===');
        consola.error('URI:', uri);
        consola.error('Body:', body);
        consola.error('Error:', error.message);
        consola.error('================================');
        throw error;
    }
}

function cleanCountries({countries, country}){
    if(!country && !countries?.length) return [];
    if(!country && countries?.length) return countries;

    return Array.from(new Set([country, ...countries])) ;
}

const filterSchemas = (schemas) => (s)=> schemas.includes(s);

function getAllQuery(ctx){
    const textLocale = ctx.indexLocal || getIndexLocale(ctx.locale);
    const cbdSchemas   = [ 'news', 'notification', 'statement', 'meeting', 'pressRelease']
    const chmSchemas   = [ 'nationalTarget7Mapping','nationalTarget7','focalPoint','resource', 'organization', 'capacityBuildingInitiative', 'contact', 'database'];
    const abschSchemas = [ 'modelContractualClause', 'communityProtocol', 'absNationalReport', 'absCheckpointCommunique', 'absCheckpoint', 'database', 'absPermit', 'absNationalModelContractualClause', 'absProcedure', 'measure', 'authority', 'focalPoint' ];
    const bchSchemas   = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert','authority', 'supplementaryAuthority',   'cpbNationalReport4', 'cpbNationalReport3', 'cpbNationalReport2',  'biosafetyNews', 'independentRiskAssessment', 'organism', 'dnaSequence', 'modifiedOrganism', 'laboratoryDetection' ];
    const allSchemas   = Array.from(new Set([ ...chmSchemas, ...abschSchemas, ...bchSchemas ]));

    const { country, countries, locale, indexLocal, page: passedPage, rowsPerPage, freeText, schemas: passedSchemas, filters:passedFilters, realms: passedRealms, isBchSite } = ctx;

    const realms                  = Array.isArray(passedRealms)? passedRealms : passedRealms? [ passedRealms ] : '';
    const schemas                 = Array.isArray(passedSchemas)? passedSchemas : passedSchemas? [ passedSchemas ] : '';
    const filters                 = Array.isArray(passedFilters)? passedFilters : passedFilters? [ passedFilters ] : '';
    const countryString           = Array.isArray(countries)? countries.join(' ')+` ${country}` : country;
    const hasCbdSchemas           = schemas?.length? schemas.some((s)=>cbdSchemas.includes(s)): false;
    const cbdSchemaQueryText      = hasCbdSchemas? `(schema_s:(${cbdSchemas.filter(filterSchemas(schemas)).join(' ')}))` : '';
    const hasOtherSchemas         = schemas?.length? schemas.some((s)=>allSchemas.includes(s)): false;
    const hasBothSchemaQueryTypes = hasCbdSchemas && hasOtherSchemas;
    const otherSchemaQueryText    = hasOtherSchemas? `((schema_s:(${allSchemas.filter(filterSchemas(schemas)).join(' ')})) AND ((hostGovernments_ss:(${countryString}) OR government_s:(${countryString}) ) OR (countryRegions_ss:(${countryString}) OR countryRegions_REL_ss:(${countryString}))))` : '';


    const schemaQuery  = schemas?.length?  `{!tag=government}${cbdSchemaQueryText}${hasBothSchemaQueryTypes? ' OR ': ''} ${otherSchemaQueryText}` : `{!tag=government}(schema_s:(${cbdSchemas.join(' ')})) OR ((schema_s:(${allSchemas.join(' ')})) AND (countryRegions_ss:(${countryString}) OR countryRegions_REL_ss:(${countryString})))`;
    const filtersQuery = filters?.length? `{!tag=keywords}all_terms_ss:(${filters.join(' ')})` : '';
    const realmText    = realms?.length? `realm_ss:(${realms.join(' ')})` : 'realm_ss:abs OR realm_ss:chm OR realm_ss:bch OR realm_ss:ort';
    const rows         = rowsPerPage? rowsPerPage : 10;
    const page         = passedPage? passedPage : 1;
    const start        = page <=1? 0 : ((page -1) * rows);
    const q            = getQ(ctx);

    // For biosafety sites with BCH realm, only search SCBD records
    const isBchRealm = realms?.length ? realms.some(r => r.toLowerCase() === 'bch') : false;
    const schemaTypeFilter = (isBchSite && isBchRealm) ? '{!tag=schemaType}(schemaType_s:scbd OR schemaType_s:reference)' : '';

    const query = {
      df: `text_${indexLocal}_txt`,
      fq: [
        "{!tag=version}(*:* NOT version_s:*)",
        schemaQuery,
        filtersQuery,
        "{!tag=excludeSchemas}(*:* NOT schema_s : (submission))",
        realmText,
        schemaTypeFilter
      ].filter((x) => x),
      q,
      sort: "updatedDate_dt desc",
      fl: `id, realm_ss, updatedDate_dt, createdDate_dt, identifier_s, uniqueIdentifier_s, url_ss, government_s, schema_${textLocale}_s, schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i, summary_s,symbol_s,startDate_dt,endDate_dt,eventCity_s,government_${textLocale}_s,title_${textLocale}_s,type_${textLocale}_s,meta1_${textLocale}_txt,meta2_${textLocale}_txt,meta3_${textLocale}_txt,meta4_${textLocale}_txt,meta5_${textLocale}_txt,eventCountry_C${textLocale}_s`,
      wt: "json",
      start,
      rows,
      facet: true,
      "facet.field": [
        "{!ex=schemaType}schemaType_s",
        "{!ex=schema,schemaType,schemaSub}schema_s",
        "{!ex=government}countryRegions_ss",
        "{!ex=keywords}all_terms_ss",
        "{!ex=region}countryRegions_REL_ss",
      ],
      "facet.mincount": 1,
      "facet.limit": 512,
      "facet.pivot": "schema_s, all_Terms_ss",
    };
    return JSON.stringify(query);
}

export function getAllBchQuery(ctx = {}){
    const textLocale = ctx.indexLocal || getIndexLocale(ctx.locale);
    const { page: passedPage, rowsPerPage, to, schemaTypes: passedSchemaTypes } = ctx;
    const rows  = rowsPerPage ?? 25;
    const page  = passedPage ?? 1;
    const start = page <= 1 ? 0 : ((page - 1) * rows);
    const q     = getQ(ctx);

    // Normalize schemaTypes to always be an array
    const schemaTypes = Array.isArray(passedSchemaTypes) ? passedSchemaTypes : passedSchemaTypes ? [passedSchemaTypes] : [];

    // Build schemaType filter based on provided types (default: both scbd and reference)
    let schemaTypeFilter;
    if (schemaTypes.length > 0) {
        const types = schemaTypes.map(type => `schemaType_s:${type}`).join(' OR ');
        schemaTypeFilter = `{!tag=schemaType}(${types})`;
    } else {
        schemaTypeFilter = "{!tag=schemaType}(schemaType_s:scbd OR schemaType_s:reference)";
    }

    // Build filter queries
    const fqBase = [
        "_state_s:public",
        "{!tag=version}(*:* NOT version_s:*)",
        schemaTypeFilter,
        "{!tag=contact}((*:* NOT schema_s:contact) OR (schema_s:contact AND (refReferenceRecords_ss:* OR refNationalRecords_ss:*)))",
        "{!tag=excludeSchemas}(*:* NOT schema_s : (submission))",
        "realm_ss:bch",
    ];

    // Only add event date filter if 'to' is provided (e.g., from latest-bch endpoint)
    if (to) {
        const toTime = cleanTime(to);
        fqBase.push(`{!tag=eventDate}((*:* NOT startDate_dt:*) OR startDate_dt:[* TO ${toTime}T23:59:59.999Z])`);
    }

    const query = {
      df: `text_${textLocale}_txt`,
      fq: fqBase,
      q,
      sort: "updatedDate_dt desc",
      fl: `id,realm_ss, rec_date:updatedDate_dt, rec_creationDate:createdDate_dt, identifier_s, uniqueIdentifier_s, url_ss, government_${textLocale}_s, schema_${textLocale}_s, government_${textLocale}_t, schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i,rec_countryName:government_${textLocale}_t, rec_title:title_${textLocale}_t, rec_summary:summary_t, rec_type:type_${textLocale}_t, rec_meta1:meta1_${textLocale}_txt, rec_meta2:meta2_${textLocale}_txt, rec_meta3:meta3_${textLocale}_txt,rec_meta4:meta4_${textLocale}_txt,rec_meta5:meta5_${textLocale}_txt,symbol_s,startDate_dt,endDate_dt,eventCountry_CEN_s,title_${textLocale}_s,eventCity_s,covers_ss,traitsDiseasesResistance_b,traitsHerbicidesResistance_b,traitsPhysiologyChanges_b,traitsQualityChanges_b,traitsMedicalProduction_b,traitsOther_b,scopeRelease_b,scopeFood_b,scopeFeed_b,scopeProcessing_b,scopeConfined_b,scopeContainedUse_b,scopeOther_b,scopePharmaceutical_b,scopeTransit_b,animals_b,bacteria_b,fungi_b,plants_b,viruses_b`,
      wt: "json",
      start,
      rows,
      facet: true,
      "facet.field": [
        "{!ex=schemaType}schemaType_s",
        "{!ex=schema,schemaType,schemaSub}schema_s",
        "{!ex=government}countryRegions_ss",
        "{!ex=keywords}all_terms_ss",
        "{!ex=region}countryRegions_REL_ss",
      ],
      "facet.mincount": 1,
      "facet.limit": 512,
      "facet.pivot": "schema_s, all_Terms_ss",
    };

    return JSON.stringify(query);
}

function getQ({ freeText, from, to }){
    let q = freeText? `(((uniqueIdentifier_t:(${freeText})^6) OR (government_EN_t:(${freeText})^5.5) OR (countryRegions_EN_txt:(${freeText})^5) OR (title_EN_t:(${freeText})^4) OR (summary_EN_t:(${freeText})^3) OR (schema_EN_t:(${freeText})^2) OR (text_EN_txt:(${freeText})^1)))` : '';

    const toTime = !to? DateTime.now().toFormat('yyyy\-MM\-dd'): cleanTime(to);

    q+= from? ` AND (updatedDate_dt:[${cleanTime(from)}T00:00:00.000Z TO ${toTime}T23:59:59.999Z])`: '';

    if(q.startsWith(' AND '))
        q = q.substring(5);

    return q? q: "''";
}

function cleanTime(time){
    return time.replace(/-/g, '\\-').replace(/:/g, '\\:');
}