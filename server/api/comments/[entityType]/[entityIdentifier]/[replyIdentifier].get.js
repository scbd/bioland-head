
export default defineEventHandler(async (event) => {
        try{
            const ctx = getContext(event);

            
            return getComments({...ctx, event });
        }
        catch (e) {
            passError(event, e);
        }
    }
)