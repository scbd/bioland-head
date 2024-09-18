
export default cachedEventHandler(async (event) => {
    try{
        const query      = getQuery      (event);
        const ctx        = getContext    (event);



        // ctx.entityIdentifier = getRouterParam(event, 'entityIdentifier');
        // ctx.entityType       = getRouterParam(event, 'entityType');
        
        // const topic = await useDrupalTopics ({event,...ctx,...query })
        // topic.comments = await useDrupalForumComments({event,...ctx,...query })

        return {}
 
    }
    catch(e){
        consola.error(e);
        consola.error(e.response);
        throw createError({
            statusCode: 500,
            statusMessage: `/api/forums/forumAlias/topicId: Failed to list comments`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey,
    base:'db',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache,
    shouldInvalidateCache
})
