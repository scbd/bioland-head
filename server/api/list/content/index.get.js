

export default cachedEventHandler(async (event) => {
    try{
        const query             = getQuery      (event);
        const ctx               = getContext    (event);

        if(query?.schemas?.length && !query?.drupalInternalIds?.length)
            query.drupalInternalIds = query.schemas

        return useContentTypeList({ ...ctx, ...query });
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/content`,
        }); 
    }
    
},{
    maxAge: 60,
    getKey,
    base:'db'
})
