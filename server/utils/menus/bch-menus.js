
const getUrl = (schemaName, passedLocale='en', passedCountry, countries) => {
    const locale   = unLocales.includes(passedLocale.toLocaleLowerCase())? passedLocale.toLocaleLowerCase() : 'en';
    const country  = Array.isArray(countries)? countries.map((c)=>`&country=${c}`).join('') : `&country=${passedCountry}`;


    const allUrls = {
        biosafetyDecision         : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=biosafetyDecision${country}`,
        nationalRiskAssessment    : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=nationalRiskAssessment${country}`,
        contact                   : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=contact${country}`,
        resource                  : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=resource${country}`,
        biosafetyLaw              : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=biosafetyLaw${country}`,
        modifiedOrganism          : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=modifiedOrganism${country}`,
        dnaSequence               : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=dnaSequence${country}`,
        notification              : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=notification${country}`,
        biosafetyNews             : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=biosafetyNews${country}`,
        capacityBuildingInitiative: `https://bch.cbd.int/${locale}/search?currentPage=1&schema=capacityBuildingInitiative${country}`,
        authority                 : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=authority${country}`,
        organization              : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=organization${country}`,
        biosafetyExpert           : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=biosafetyExpert${country}`,
        focalPoint                : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=focalPoint${country}`,
        meeting                   : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=meeting${country}`,
        organism                  : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=organism${country}`,
        countryProfile            : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=countryProfile${country}`,
        database                  : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=database${country}`,
        pressRelease              : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=pressRelease${country}`,
        laboratoryDetection       : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=laboratoryDetection${country}`,
        statement                 : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=statement${country}`,
        new                       : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=new${country}`,
        independentRiskAssessment : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=independentRiskAssessment${country}`,
        supplementaryAuthority    : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=supplementaryAuthority${country}`,
        nationalReport            : `https://bch.cbd.int/${locale}/search?currentPage=1&schema=cpbNationalReportInterim&schema=cpbNationalReport1&schema=cpbNationalReport2&schema=cpbNationalReport3&schema=cpbNationalReport4${country}`,
    }

    return allUrls[schemaName]
}
// export const bchMegaMenuSchemas = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert']

export async function getBchMenus(ctx){
    const { country:aCountry, countries, locale } = ctx;

    const country = countries?.length? countries : aCountry;

    if(!country) return

    const response  = await queryScbdIndex(ctx,getIndexQuery(country));

    return makeObject(response?.facet_counts?.facet_fields?.schema_s, { country, locale, countries } );
}

const nationalReportSchemas = ['cpbNationalReportInterim', 'cpbNationalReport1', 'cpbNationalReport2', 'cpbNationalReport3', 'cpbNationalReport4']

function makeObject(facetsArray=[], { country, locale, countries }){

    if(!facetsArray?.length) return {};

    const nationalReport = generateNationalReportFacet(facetsArray, { country, locale });
    const facets         = { nationalReport };

    for (let index = 0; index < facetsArray.length; index+=2) {
        if( isOddNumber(index) ) continue;
        
        const schemaName = facetsArray[index];

        if(nationalReportSchemas.includes(schemaName)) continue;

        const count = facetsArray[index+1];
        const href  = getUrl(schemaName, locale, country, countries );


        if(!count) continue;

        facets[schemaName] = { count, href };
    }

    return facets
}

function generateNationalReportFacet(facetsArray=[], { country, locale, countries }){
    let   count           = 0 ;

    for (let index = 0; index < facetsArray.length; index+=2) {
        if( isOddNumber(index)) continue;

        const schemaName = facetsArray[index];

        if( !nationalReportSchemas.includes(schemaName)) continue;
        
        count += facetsArray[index+1]
    }

    const href  = getUrl('nationalReport',locale, country, countries );

    return { count, href }
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
                "realm_ss:bch"
                ],
                "q": "''",
                "sort": "updatedDate_dt desc",
                "fl": "id, rec_date:updatedDate_dt, rec_creationDate:createdDate_dt, identifier_s, uniqueIdentifier_s, url_ss, government_s, schema_s, government_EN_t, schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i,rec_countryName:government_EN_t, rec_title:title_EN_t, rec_summary:summary_t, rec_type:type_EN_t, rec_meta1:meta1_EN_txt, rec_meta2:meta2_EN_txt, rec_meta3:meta3_EN_txt,rec_meta4:meta4_EN_txt,rec_meta5:meta5_EN_txt,symbol_s,startDate_dt,endDate_dt,eventCountry_CEN_s,title_s,eventCity_s,traitsDiseasesResistance_b,traitsHerbicidesResistance_b,traitsPhysiologyChanges_b,traitsQualityChanges_b,traitsMedicalProduction_b,traitsOther_b,scopeRelease_b,scopeFood_b,scopeFeed_b,scopeProcessing_b,scopeConfined_b,scopeContainedUse_b,scopeOther_b,scopePharmaceutical_b,scopeTransit_b,animals_b,bacteria_b,fungi_b,plants_b,viruses_b",
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