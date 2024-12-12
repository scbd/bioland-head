export default cachedEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return getSystemPagesMap(parseContext(context));
        }
        catch (e) {
            passError(event, e);
        }
    }, 
    listCache
)
