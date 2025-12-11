
export default cachedEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            return useDrupalTopicMenus(ctx);
        }
        catch (e) {
            passError(event, e);
        }
    }
)
