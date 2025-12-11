export default cachedEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            return getBchMenus(ctx);
        }
        catch (e) {

            passError(event, e);
        }
    },
    externalCache
)
