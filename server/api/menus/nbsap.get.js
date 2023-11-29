import SA      from 'superagent'               ;

const $http   = {}//SA.agent()

export default cachedEventHandler(async (event) => {
    try{
    
        const receivedQuery = parseQuery(event);
        const query         = getQueryString(receivedQuery)
        const response      = await $indexFetch(query)

        return response?.docs?.length? response.docs.map(mapDocs(receivedQuery.locale)).filter(filterDocs(receivedQuery.locale)) : {};
    }
    catch(e){
        console.log(e)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the chm api',
        }) 
    }
    
},{
    maxAge: 60 * 60 * 24,
    varies:['Cookie']
})

function getQueryString({ countries, country, locale }={}){
    
    const fields = getIndexNrFields(locale);
    const q      = getIndexQuery('nationalReport', { countries, country });
    const rows   = `rows=500&sort=createdDate_dt+desc&start=0&wt=json`;

    return q+'&'+fields+'&'+rows;
}

function mapDocs(locale){ return (aDoc) => {
        const href  = aDoc.urls[0];
        const title = aDoc[`reportType`];

        return { title, href }
    }
}

function filterDocs(locale){ return (aDoc) => {

    return aDoc.title.includes('NBSAP');
}
}