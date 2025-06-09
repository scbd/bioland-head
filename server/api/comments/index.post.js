
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

        const context = await getContext (event);
        const resp    = await postComment(event);

        return resp;

        async function postComment(event){
            const { locale: localeCtx } = await getContext (event);
            const   locale              = localeChosen || localeCtx;
            const   uri                 = `${context.host}/${locale}${typeMap[entityType]}`;
            const   method              = 'post';


            const { headers }   = event?.context || {};
            const body          = getCommentTemplate({ entityIdentifier, entityType, replyIdentifier, replyType, comment });


            return  $fetch(uri,$fetchBaseOptions({ method, headers, body }) );
        }
    }
    catch (e) {
        consola.error(e.data.errors[0])
        passError(event, e);
    }
})

function getCommentTemplate({ entityIdentifier, entityType, replyIdentifier, replyType, comment,}){

    const entity_id =   { data: { type: entityType, id: entityIdentifier } };

    const data = {
                    type      : 'comment--comment_forum',
                    attributes: {
                        entity_type :  'node',
                        field_name  :  'comment_forum',
                        comment_body: {
                                        value: htmlSanitize(comment),
                                        format: 'basic_html',
                                    }
                    },
                    relationships: { entity_id }
                };

    if(replyIdentifier) 
        data.relationships.pid ={  data: {id: replyIdentifier, type: replyType} }

    return {data}
}