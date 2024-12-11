export default cachedEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return getAbschMenus(context);
        }
        catch (e) {

            passError(event, e);
        }
    },
    externalCache
)
