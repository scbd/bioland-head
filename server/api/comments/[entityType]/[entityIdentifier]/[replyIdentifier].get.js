
export default defineEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            
            return await getComments({...ctx, event });
        }
        catch (e) {
            return passError(event, e);
        }
    }
)