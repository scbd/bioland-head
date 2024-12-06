const getUrl = (schemaName, passedLocale='en', passedCountry, countries) => {
        const locale   = unLocales.includes(passedLocale.toLocaleLowerCase())? passedLocale.toLocaleLowerCase() : 'en';
        const country  = Array.isArray(countries)? countries.map((c)=>`&country=${c}`).join('') : `&country=${passedCountry}`;


        const allUrls  ={
            measure                          : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=measure${country}`,
            procedure                        : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=procedure${country}`,
            absPermit                        : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=absPermit${country}`,
            contact                          : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=contact${country}`,
            authority                        : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=authority${country}`,
            notification                     : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=notification${country}`,
            news                             : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=news${country}`,
            organization                     : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=organization${country}`,
            resource                         : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=resource${country}`,
            focalPoint                       : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=focalPoint${country}`,
            absCheckpointCommunique          : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=absCheckpointCommunique${country}`,
            new                              : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=new${country}`,
            pressRelease                     : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=pressRelease${country}`,
            meeting                          : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=meeting${country}`,
            absNationalReport                : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=absNationalReport${country}`,
            capacityBuildingInitiative       : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=capacityBuildingInitiative${country}`,
            absCheckpoint                    : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=absCheckpoint${country}`,
            database                         : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=database${country}`,
            statement                        : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=statement${country}`,
            communityProtocol                : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=communityProtocol${country}`,
            modelContractualClause           : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=modelContractualClause${country}`,
            absProcedure                     : `https://absch.cbd.int/${locale}/search?currentPage=1&schema=absProcedure${country}`,
            absNationalModelContractualClause: `https://absch.cbd.int/${locale}/search?currentPage=1&schema=absNationalModelContractualClause${country}`,
        }
    
        return allUrls[schemaName];
}

export async function getAbschMenus(ctx){
    const { country:aCountry, countries, locale } = ctx;

    const country   = countries?.length? countries : aCountry;
    
    if(!country) return;

    const response  = await queryScbdIndex(ctx,getIndexQuery(country));

    return makeObject(response?.facet_counts?.facet_fields?.schema_s, { country, locale, countries } );
}

const nationalReportSchemas = ['cpbNationalReportInterim', 'cpbNationalReport1', 'cpbNationalReport2', 'cpbNationalReport3', 'cpbNationalReport4']

function makeObject(facetsArray=[], { country, countries, locale }){
    if(!facetsArray?.length) return {};

    const facets         = { };

    for (let index = 0; index < facetsArray.length; index+=2) {
        if( isOddNumber(index) ) continue;
        
        const schemaName = facetsArray[index];

        if(nationalReportSchemas.includes(schemaName)) continue;

        const count = facetsArray[index+1];
        const href  = getUrl(schemaName, locale, country, countries )

        if(!count) continue;

        facets[schemaName] = { count, href };
    }

    return facets
}



function getIndexQuery(passedCountry){
    const country = Array.isArray(passedCountry)? passedCountry.join(' ') : passedCountry;

    const query = {
        "df": "text_EN_txt",
        "fq": [
        `{!tag=government}countryRegions_ss:(${country}) OR countryRegions_REL_ss:(${country})`,
        "{!tag=version}(*:* NOT version_s:*)",
        "{!tag=contact}(*:* NOT schema_s:contact) OR (schema_s:contact AND (refReferenceRecords_ss:* OR refNationalRecords_ss:*))",
        "{!tag=excludeSchemas}(*:* NOT schema_s : (submission))",
        "realm_ss:abs"
        ],
        "q": "''",
        "sort": "updatedDate_dt desc",
        "fl": "id, rec_date:updatedDate_dt, rec_creationDate:createdDate_dt, identifier_s, uniqueIdentifier_s, url_ss, government_s, schema_s, government_EN_t, schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i,rec_countryName:government_EN_t, rec_title:title_EN_t, rec_summary:summary_t, rec_type:type_EN_t, rec_meta1:meta1_EN_txt, rec_meta2:meta2_EN_txt, rec_meta3:meta3_EN_txt,rec_meta4:meta4_EN_txt,rec_meta5:meta5_EN_txt,symbol_s,startDate_dt,endDate_dt,eventCountry_CEN_s,title_s,eventCity_s",
        "wt": "json",
        "start": 0,
        "rows": 1,
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
    return query;
}