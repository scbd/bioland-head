
export default cachedEventHandler(async (event) => {
    try{

        const forumAlias = getRouterParam(event, 'forumAlias')
        const query      = getQuery      (event);
        const ctx        = getContext    (event);

        ctx.forumAlias = getRouterParam(event, 'forumAlias')

        await addForumIdentifierToContext(ctx)
        // ctx.uuid='1443cdfc-7749-4b92-8f3c-83efe34b5619'
        //const tid = await getForumTidFromAlias({...ctx,...query, forumAlias })
// return isInt(parseInt('%^'))//isNaN()
        // if(isNaN(parseInt(123)))//.isInteger(123)//useDrupalForums({...ctx,...query, identifier });
        // return true
        // return false

        return useDrupalForums({...ctx,...query })
    }
    catch(e){
        consola.error(e.response);
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
