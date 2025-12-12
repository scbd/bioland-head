

export default defineEventHandler(async (event) => {
    try{
        const query             = getQuery      (event);
        const ctx               = await useRequestContext(event);

        if(query?.schemas?.length && !query?.drupalInternalIds?.length)
            query.drupalInternalIds = Array.isArray(query.schemas)? query.schemas : [query.schemas];

        // Merge context and query, with query taking precedence for locale-related params
        // This ensures client-provided locale (from i18n) is used when available
        return useContentTypeIndex({ ...ctx, ...query });
    }
    catch (e) {
        passError(event, e);
    }
}
)
