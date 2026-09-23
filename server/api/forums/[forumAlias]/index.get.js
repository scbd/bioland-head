import { mergeQueryIntoContext } from '../../../utils/merge-query-into-context';
export default defineEventHandler(async (event) => {
        try{
            const query      = getQuery      (event);
            const ctx        = await useRequestContext(event);

            ctx.forumAlias   = getRouterParam(event, 'forumAlias')

            await addForumIdentifierToContext(ctx)

            return await useDrupalForums(mergeQueryIntoContext(ctx, query))
        }
        catch (e) {
            passError(event, e);
        }
    }
)
