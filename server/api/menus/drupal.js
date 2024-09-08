
export default cachedEventHandler(async (event) => {
    try{
        // const query   = getQuery(event);
        const context = getContext(event);

        return useMenus ({...context});//, ...query
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  get drupal menus',
        }); 
    }
    
},{
    maxAge: 1,
    getKey,
    base:'db'
})
