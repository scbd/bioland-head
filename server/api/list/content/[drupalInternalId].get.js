

export default cachedEventHandler(async (event) => {
    try{
        const query            = getQuery      (event);
        const drupalInternalId = getRouterParam(event, 'drupalInternalId');
        const ctx              = getContext    (event);

        return useContentTypeList({ ...ctx, ...query, drupalInternalId });
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/content/${getRouterParam(event, 'type')}`,
        }); 
    }
    
},{
    maxAge: 60,
    getKey
})
