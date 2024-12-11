export default defineEventHandler(async (event) => {
    try{
        const ctx  =  await getContext(event)

        return ctx.localizedHost? getSystemPagesMap(ctx) : ctx;
    }
    catch (e) {
        passError(event, e);
    }
    
})
