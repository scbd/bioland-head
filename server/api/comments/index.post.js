
export default defineEventHandler(async (event) => {

    const typeMap = {
        content                      : '/jsonapi/comment/comment'         ,
        'node--content'              : '/jsonapi/comment/comment'         ,
        topic                        : '/jsonapi/comment/comment_forum'   ,
        'node--forum'                : '/jsonapi/comment/comment_forum'   ,
        media                        : '/jsonapi/comment/comment_media'   ,
        'media--image'               : '/jsonapi/comment/comment_media'   ,
        'media--document'            : '/jsonapi/comment/comment_media'   ,
        'media--image'               : '/jsonapi/comment/comment_media'   ,
        'media--remote_video'        : '/jsonapi/comment/comment_media'   ,
        taxonomy                     : '/jsonapi/comment/comment_taxonomy',
        'taxonomy_term--system_pages': '/jsonapi/comment/comment_taxonomy'
    };

    try{
        const   token                               = getToken(event);
        const { identifier, type, replyIdentifier, comment } = await readBody(event);
        const   context                             = getContext (event);

        return { identifier, type, replyIdentifier, comment } 
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to upload images',
        }); 
    }
    
})

function getCommentTemplate(){

    const templateObj = {
                            type: "comment--comment_forum",
                            attributes: {
                                langcode: "en",
                                //status: 0,
                                // mail: null,
                                // homepage: null,
                                //thread: "01/",
                                entity_type: "node",
                                field_name: "comment_forum",
                                entity_id:"",
                                // default_langcode: true,
                                // content_translation_source: "und",
                                // content_translation_outdated: false,my kids*

                                comment_body: {
                                    value: "<p>What are our protected ares within our Country?</p>",
                                    format: "full_html",
                                }
                            },
                            // relationships: {
                            //     entity_id: {
                            //         data: {
                            //             type: "node--forum",
                            //             id: "05916b3c-986d-4947-ad90-22d1770f8d7c"
                            //         }
                            //     }
                            // }
                        }
}