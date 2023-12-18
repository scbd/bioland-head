

export default cachedEventHandler(async (event) => {
    try{
        const query            = getQuery      (event);
        const ctx              = getContext    (event);

        return useAllMedia({ ...ctx, ...query });
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/media/all}`,
        }); 
    }
    
},{
    maxAge: 60*5,
    varies:['Cookie']
})
