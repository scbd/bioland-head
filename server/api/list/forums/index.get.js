

export default cachedEventHandler(async (event) => {
    try{
        const query             = getQuery      (event);
        const ctx               = getContext    (event);


        return useDrupalForumMenus({...ctx,...query});
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/content`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey
})
