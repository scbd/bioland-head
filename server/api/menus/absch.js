export default cachedEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            return getAbschMenus(ctx);
        }
        catch (e) {

            passError(event, e);
        }
    },
    externalCache
)
