import { DateTime     } from 'luxon' ; 

export const indexUri = 'https://api.cbd.int/api/v2013/index/select?';

export const $indexFetch = async (queryString) => {

    const uri           = indexUri;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { response } = await $fetch(uri+queryString, { method, headers });

    response.docs = response.docs.map(normalizeIndexKeys);

    return response
};

export const getIndexLocale = (locale) => ['en', 'ar', 'es', 'fr', 'ru', 'zh'].includes(locale)? locale.toLocaleUpperCase() : 'EN';



export const getIndexCountryQuery = ({ countries, country }={}) => [ country, ...(countries||[]) ].map((s)=>`hostGovernments_ss:${s}`).join('+OR+');

export const getIndexQuery = (s, { countries, country }={}) => {

    const schema = Array.isArray(s)? s.map((aSchema)=>`schema_s:${aSchema}`).join('+OR+'): `schema_s:${s}`;
    const countryQueryString = getIndexCountryQuery({ countries, country });


    return`q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(${schema})+AND+(${countryQueryString})`;
}


export const getIndexFocalPointFields = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = [
                    `title_${locale}_s`,
                    `schema_${locale}_s`,
                    `type_${locale}_txt`,
                    `description_${locale}_s`,
                    `salutation_${locale}_s`,
                    `address_${locale}_s`,
                    `function_${locale}_s`,
                    `department_${locale}_s`,
                    `organization_${locale}_s`,
                    `addressCountry_${locale}_s`,
                    `treaty_${locale}_ss`,
                    `firstName_s`,
                    `lastName_s`,
                    `telephone_ss`,
                    `fax_ss`,
                    `type_ss`,
                    `createdDate_dt`,
                    `url_ss`
                ];

    return `fl=${fields.join(',')}`;
}

export const getIndexFocalPointTypesFields = (localePassed) => {
    const locale = getIndexLocale(localePassed);

    const fields = [
                    `type_${locale}_txt`,
                    'hostGovernments_ss',
                    `type_ss`
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
                            .replace(/_C[A-Z]{2}/, '')
                            .replace('_s', '')
                            .replace('_t', '')
                            .replace(/_dt/, '');

            
            newObj[newKey] = obj[key];

            if(newKey==='urls' && newObj?.urls?.length)
                newObj.url = newObj.urls[0];

            if(newKey==='realms')
                newObj.realms = Array.from(new Set(newObj.realms.map((realm)=>realm.toLocaleUpperCase())))
    }

    return newObj;
}

export const useScbdIndex = async (ctx) => {
    const uri = 'https://api.cbd.int/api/v2013/index/select';

    //return  JSON.parse(getAllQuery(ctx))
    const { response, facet_counts: facetCounts } = await $fetch(uri,  { method:'post', body: getAllQuery(ctx), headers: {'Content-Type': 'application/json'}});

    response.data  = response.docs.map(normalizeIndexKeys)//.filter(({ title, summary })=> (title && summary));
    response.count = response.numFound;

    delete response.docs;

    return { ...response, facetCounts };
}

const filterSchemas = (schemas) => (s)=> schemas.includes(s);

function getAllQuery(ctx){
    const cbdSchemas   = [ 'news', 'notification', 'statement', 'meeting', 'pressRelease']
    const chmSchemas   = [ 'focalPoint','resource', 'organization', 'capacityBuildingInitiative', 'contact', 'database'];
    const abschSchemas = [ 'modelContractualClause', 'communityProtocol', 'absNationalReport', 'absCheckpointCommunique', 'absCheckpoint', 'database', 'absPermit', 'absNationalModelContractualClause', 'absProcedure', 'measure', 'authority', 'focalPoint' ];
    const bchSchemas   = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert','authority', 'supplementaryAuthority',   'cpbNationalReport4', 'cpbNationalReport3', 'cpbNationalReport2',  'biosafetyNews', 'independentRiskAssessment', 'organism', 'dnaSequence', 'modifiedOrganism', 'laboratoryDetection' ];
    const allSchemas   = Array.from(new Set([ ...chmSchemas, ...abschSchemas, ...bchSchemas ]));

    

    const { country, countries, locale, indexLocal, page: passedPage, rowsPerPage, freeText, schemas: passedSchemas, filters:passedFilters, realms: passedRealms } = ctx;

const realms                  = Array.isArray(passedRealms)? passedRealms : passedRealms? [ passedRealms ] : '';
const schemas                 = Array.isArray(passedSchemas)? passedSchemas : passedSchemas? [ passedSchemas ] : '';
const filters                 = Array.isArray(passedFilters)? passedFilters : passedFilters? [ passedFilters ] : '';
const countryString           = Array.isArray(countries)? countries.join(' ')+` ${country}` : country;
const hasCbdSchemas           = schemas?.length? schemas.some((s)=>cbdSchemas.includes(s)): false;
const cbdSchemaQueryText      = hasCbdSchemas? `(schema_s:(${cbdSchemas.filter(filterSchemas(schemas)).join(' ')}))` : '';
const hasOtherSchemas         = schemas?.length? schemas.some((s)=>allSchemas.includes(s)): false;
const hasBothSchemaQueryTypes = hasCbdSchemas && hasOtherSchemas;
const otherSchemaQueryText    = hasOtherSchemas? `((schema_s:(${allSchemas.filter(filterSchemas(schemas)).join(' ')})) AND (countryRegions_ss:(${countryString}) OR countryRegions_REL_ss:(${countryString})))` : '';


const schemaQuery  = schemas?.length?  `{!tag=government}${cbdSchemaQueryText}${hasBothSchemaQueryTypes? ' OR ': ''} ${otherSchemaQueryText}` : `{!tag=government}(schema_s:(${cbdSchemas.join(' ')})) OR ((schema_s:(${allSchemas.join(' ')})) AND (countryRegions_ss:(${countryString}) OR countryRegions_REL_ss:(${countryString})))`;
const filtersQuery = filters?.length? `{!tag=keywords}all_terms_ss:(${filters.join(' ')})` : '';
const realmText    = realms?.length? `realm_ss:(${realms.join(' ')})` : 'realm_ss:abs OR realm_ss:chm OR realm_ss:bch';
const rows         = rowsPerPage? rowsPerPage : 10;
const page         = passedPage? passedPage : 1;
const start        = page <=1? 0 : ((page -1) * rows);

const q            = getQ(ctx);


    const query = {
        
            df: `text_${indexLocal}_txt`,
            fq: [
                "{!tag=version}(*:* NOT version_s:*)",
                schemaQuery,
                filtersQuery,
                "{!tag=excludeSchemas}(*:* NOT schema_s : (submission))",
                realmText
                //"realm_ss:abs OR realm_ss:chm OR realm_ss:bch"
            ],
            q,
            "sort": "startDate_dt desc, updatedDate_dt desc",
            "fl": "id, realm_ss, updatedDate_dt, createdDate_dt, identifier_s, uniqueIdentifier_s, url_ss, government_s, schema_s, government_EN_s, schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i,government_EN_s, title_EN_s, summary_s, type_EN_s, meta1_EN_txt, meta2_EN_txt, meta3_EN_txt,meta4_EN_txt,meta5_EN_txt,symbol_s,startDate_dt,endDate_dt,eventCountry_CEN_s,eventCity_s",
            "wt": "json",
            start, rows,
            "facet": true,
            "facet.field": [
                "{!ex=schemaType}schemaType_s",
                "{!ex=schema,schemaType,schemaSub}schema_s",
                "{!ex=government}countryRegions_ss",
                "{!ex=keywords}all_terms_ss",
                "{!ex=region}countryRegions_REL_ss"
            ],
            "facet.mincount": 1,
            "facet.limit": 512,
            "facet.pivot": "schema_s, all_Terms_ss"
            
            }
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