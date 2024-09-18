
export default defineEventHandler(async (event) => {

    const typeMap = {
        content                      : '/jsonapi/comment/comment'         ,
        'node--content'              : '/jsonapi/comment/comment'         ,
        topic                        : '/jsonapi/comment/comment_forum'   ,
        'node--forum'                : '/jsonapi/comment/comment_forum'   ,
        media                        : '/jsonapi/comment/comment_media'   ,
        'media--image'               : '/jsonapi/comment/comment_media'   ,
        'media--document'            : '/jsonapi/comment/comment_media'   ,
        'media--remote_video'        : '/jsonapi/comment/comment_media'   ,
        taxonomy                     : '/jsonapi/comment/comment_taxonomy',
        'taxonomy_term--system_pages': '/jsonapi/comment/comment_taxonomy'
    };

    try{

        const { entityIdentifier, entityType, replyIdentifier, replyType, comment, localeChosen } = await readBody(event);
        const   context                             = await getContext (event);

const resp = await postComment()
        return resp//{ identifier, type, replyIdentifier, comment } //resp////resp//{ identifier, type, replyIdentifier, comment,  token , context } 




        
        async function postComment(){
            const { locale: localeCtx } = context;
            const locale = localeChosen || localeCtx;
            const uri           = `${context.host}/${locale}${typeMap[entityType]}`;//`${context.localizedHost}${typeMap[type]}`
            const method        = 'post';


            const { headers }      = event?.context || {}//{ 'Content-Type': 'application/vnd.api+json', 'X-CSRF-Token':token, Cookie: getHeader(event, 'Cookie')}; //,Cookie: getHeader(event, 'Cookie')
            const body          = getCommentTemplate({ entityIdentifier, entityType, replyIdentifier, replyType, comment })


            return  $fetch(uri, { method, headers, body });
        }
    }
    catch(e){
        // console.error(e);
        // console.error(e.statusCode);
        // console.error(e.statusMessage);
        // console.error(e.data.errors);
        throw createError({
            statusCode: e.statusCode,
            statusMessage: e.statusMessage,
            data: e.data,
        }); 
    }
    
})

function getCommentTemplate({ entityIdentifier, entityType, replyIdentifier, replyType, comment,}){

    const data = {
                            type: "comment--comment_forum",
                            attributes: {

                                entity_type :  "node",
                                field_name :  "comment_forum",
                                comment_body: {
                                    value: comment,
                                    format: "basic_html",
                                }
                            },
                            relationships: {
                                entity_id: {
                                    data: {
                                        type: entityType,
                                        id:entityIdentifier
                                    }
                                }
                            }
                        }

    if(replyIdentifier) 
        data.relationships.pid ={  data: {id: replyIdentifier, type: replyType} }

    return {data}
}