export default defineEventHandler(async (event) => {
    try{
        const ctx = await useRequestContext(event);

        return ctx.localizedHost? await getSystemPagesMap(ctx) : ctx;
    }
    catch (e) {
        passError(event, e);
    }
    
})
