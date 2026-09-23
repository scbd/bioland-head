
export default defineEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            
            return await getComments({...ctx, event });
        }
        catch (e) {
            passError(event, e);
        }
    }
)