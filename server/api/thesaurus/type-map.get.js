

export default cachedEventHandler(async (event) => {
    try{
        const ctx =  getContext(event)

        const { tags } = getQuery(event)


        
        return  getThesaurusByKey(tags)
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get thesuarus type map from tags',
        }); 
    }
    
},{
    maxAge: 60*60*24,
    getKey,
    base:'db'
})
