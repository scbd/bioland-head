

export default cachedEventHandler(async (event) => {
    try{
        const query             = getQuery      (event);
        const ctx               = getContext    (event);


        return useDrupalTopicMenus({...ctx,...query});
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `/api/list/topics: Failed to list forums`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey,
    base:'db'
})
