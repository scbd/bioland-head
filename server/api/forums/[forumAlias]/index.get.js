export default defineEventHandler(async (event) => {
        try{
            const query      = getQuery      (event);
            const ctx        = getContext    (event);

            ctx.forumAlias   = getRouterParam(event, 'forumAlias')

            await addForumIdentifierToContext(ctx)

            return useDrupalForums({...ctx,...query })
        }
        catch (e) {
            passError(event, e);
        }
    }
)
