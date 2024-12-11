export default cachedEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return getBchMenus(context);
        }
        catch (e) {

            passError(event, e);
        }
    },
    externalCache
)
