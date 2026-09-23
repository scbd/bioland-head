import { mergeQueryIntoContext } from '../../../utils/merge-query-into-context';


export default defineEventHandler(async (event) => {
    try{
        const query             = getQuery      (event);
        const ctx               = await useRequestContext(event);

        if(query?.schemas?.length && !query?.drupalInternalIds?.length)
            query.drupalInternalIds = Array.isArray(query.schemas)? query.schemas : [query.schemas];

        // Server context wins over the query (BL-1135); a served client locale is already adopted by useRequestContext.
        return await useContentTypeIndex(event, mergeQueryIntoContext(ctx, query));
    }
    catch (e) {
        passError(event, e);
    }
}
)
