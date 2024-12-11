
export default cachedEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return useDrupalTopicMenus(parseContext(context));
        }
        catch (e) {
            passError(event, e);
        }
    }
)
