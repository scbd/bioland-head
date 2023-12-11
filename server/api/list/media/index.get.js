

export default cachedEventHandler(async (event) => {
    try{
        const query            = getQuery      (event);
        const ctx              = getContext    (event);

        return useMediaTypeList({ ...ctx, ...query });
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/media/${getRouterParam(event, 'type')}`,
        }); 
    }
    
},{
    maxAge: 1,
    varies:['Cookie']
})
