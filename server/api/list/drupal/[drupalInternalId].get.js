import { mergeQueryIntoContext } from '../../../utils/merge-query-into-context';
export default defineEventHandler(async (event) => {
        try{
            const query            = getQuery      (event);
            const drupalInternalId = getRouterParam(event, 'drupalInternalId');
            const ctx              = await useRequestContext(event);

            // Server context wins over the query (BL-1135); a served client locale is already adopted by useRequestContext.
            return await useContentTypeIndex (event, { ...mergeQueryIntoContext(ctx, query), drupalInternalId });
        }
        catch (e) {
            passError(event, e);
        }
    }
)
