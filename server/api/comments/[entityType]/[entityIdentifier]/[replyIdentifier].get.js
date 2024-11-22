
export default cachedEventHandler(async (event) => {
    try{
        const ctx = getContext(event);

        return getComments(ctx);
    }
    catch(e){
        const host             = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
        const entityType       = getRouterParam(event, 'entityType');
        const entityIdentifier = getRouterParam(event, 'entityIdentifier');
        const replyIdentifier  = getRouterParam(event, 'replyIdentifier');

        console.error(`${host}/server/api/comments/[${entityType}]/[${entityIdentifier}]/[${replyIdentifier}].get.js`, e);

        throw createError({
            statusCode: e.statusCode,
            statusMessage: e.statusMessage,
            message:`${host}/server/api/comments/[${entityType}]/[${entityIdentifier}]/[${replyIdentifier}].get.js`+e.message,
            data: e.data,
        }); 
    }
},
    // commentCache
)