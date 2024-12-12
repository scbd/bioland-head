export default defineEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return useContentTypeMenus(parseContext(context));
        }
        catch (e) {
            passError(event, e);
        }
    }
)
