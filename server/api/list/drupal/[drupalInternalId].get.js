export default defineEventHandler(async (event) => {
        try{
            const query            = getQuery      (event);
            const drupalInternalId = getRouterParam(event, 'drupalInternalId');
            const ctx              = await useRequestContext(event);

            // Merge context and query, with query taking precedence for locale-related params
            // This ensures client-provided locale (from i18n) is used when available
            return useContentTypeIndex ({ ...ctx, ...query, drupalInternalId });
        }
        catch (e) {
            passError(event, e);
        }
    }
)
