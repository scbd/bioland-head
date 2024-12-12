export default cachedEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return getInstalledLanguages(context);
        }
        catch (e) {

            passError(event, e);
        }
    },
    externalCache
)
