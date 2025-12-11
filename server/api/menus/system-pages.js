export default cachedEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            return getSystemPagesMap(ctx);
        }
        catch (e) {
            passError(event, e);
        }
    }, 
    listCache
)
