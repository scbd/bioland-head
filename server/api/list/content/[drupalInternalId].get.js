export default cachedEventHandler(async (event) => {
        try{
            const query            = getQuery      (event);
            const drupalInternalId = getRouterParam(event, 'drupalInternalId');
            const ctx              = getContext    (event);

            return useContentTypeList({ ...ctx, ...query, drupalInternalId });
        }
        catch (e) {
            passError(event, e);
        }
    }
)
