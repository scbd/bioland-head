export default cachedEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            return getInstalledLanguages(ctx);
        }
        catch (e) {

            passError(event, e);
        }
    },
    externalCache
)
