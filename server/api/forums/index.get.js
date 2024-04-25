

export default cachedEventHandler(async (event) => {
    try{

        const query             = getQuery      (event);
        const ctx               = getContext    (event);


        return useDrupalForums({...ctx,...query});
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `/api/forums: Failed to list forums`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey,
    base:'db'
})
