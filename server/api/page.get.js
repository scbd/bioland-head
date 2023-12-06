

export default cachedEventHandler(async (event) => {
    try{


        const ctx =  getContext(event)




        
        return  ctx
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get page data',
        }); 
    }
    
},{
    maxAge: 30,
    varies:['Cookie']
})
