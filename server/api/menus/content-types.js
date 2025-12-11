export default defineEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            return useContentTypeMenus(ctx);
        }
        catch (e) {
            passError(event, e);
        }
    }
)
