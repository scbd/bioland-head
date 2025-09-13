

export default defineEventHandler(async (event) => {
        try{
            const query             = getQuery      (event);
            const ctx               = getContext    (event);

            if(query?.schemas?.length && !query?.drupalInternalIds?.length)
                query.drupalInternalIds = Array.isArray(query.schemas)? query.schemas : [query.schemas];

            return useContentTypeList({ ...ctx, ...query });
        }
        catch (e) {
            passError(event, e);
        }
    }
)
