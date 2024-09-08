export default defineEventHandler(async (event) => {
    try{

        const user = await getUser(event);

        
        return user
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get me me',
        }); 
    }
    
})
