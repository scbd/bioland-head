export function getNationalTargetByCounty(ctx){
    return getNationalTargets(ctx);
}

function indexQuery(countries = [], start = 0, rows = 25, locale = 'EN') {
    const fq = [
        "_state_s:public",
        "realm_ss:ort"
    ];
    const governmentQuery = countries.length > 0 ? `government_s : (${countries.join(' ')})` : '';
    const q = `(schema_s : (nationalTarget7 nationalTarget7Mapping)${governmentQuery ? ` AND ${governmentQuery}` : ''})`;

    return JSON.stringify({
        df: `text_${locale.toUpperCase()}_txt`,
        fq,
        q,
        sort: "updatedDate_dt desc",
        fl: `id, schema_s, recDate:updatedDate_dt, recCreationDate:createdDate_dt, identifier_s, uniqueIdentifier_s, url_ss, government_s, schema_s,schema_${locale.toUpperCase()}_s, government_${locale.toUpperCase()}_s, schemaSort_i, sort1_i, sort2_i, sort3_i, sort4_i, _revision_i,recCountryName:government_${locale.toUpperCase()}_t, recTitle:title_${locale.toUpperCase()}_t, recSummary:summary_t, recType:type_${locale.toUpperCase()}_t, recMeta1:meta1_${locale.toUpperCase()}_txt, recMeta2:meta2_${locale.toUpperCase()}_txt, recMeta3:meta3_${locale.toUpperCase()}_txt,recMeta4:meta4_${locale.toUpperCase()}_txt,recMeta5:meta5_${locale.toUpperCase()}_txt,globalTargetAlignment_ss,globalGoalOrTarget_s,globalGoalAlignment_ss`,
        wt: "json",
        start,
        rows
    });
}

async function getNationalTargets(ctx = {}) {
    const { countries = [], start = 0, rows = 25 } = ctx;
    const query = indexQuery(countries, start, rows);

    const { gaiaApi } = useRuntimeConfig().public;
    const uri = `${gaiaApi}/v2013/index/select`;

    try {
        const { response } = await $fetch(uri, {
            method: 'post',
            body: query,
            headers: { 'Content-Type': 'application/json' }
        });

        return response;
    } catch (error) {
        consola.error('Error fetching national targets:', error);
        throw error;
    }
}