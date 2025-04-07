export default defineEventHandler(async (event) => {
        try{
            const query            = getQuery      (event);
            const drupalInternalId = getRouterParam(event, 'drupalInternalId');
            const ctx              = getContext    (event);

            return useContentTypeIndex ({ ...ctx, ...query, drupalInternalId });
        }
        catch (e) {
            passError(event, e);
        }
    }
)
