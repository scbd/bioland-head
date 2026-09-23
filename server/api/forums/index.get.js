import { mergeQueryIntoContext } from '../../utils/merge-query-into-context';
export default defineEventHandler(async (event) => {
        try{

            const query             = getQuery      (event);
            const ctx               = await useRequestContext(event);

            return await useDrupalForums({ ...mergeQueryIntoContext(ctx, query), event });
        }
        catch (e) {
            passError(event, e);
        }
    }
)
