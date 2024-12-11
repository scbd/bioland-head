
export default defineEventHandler(async (event) => {
        try{
            const ctx = getContext(event);

            return getComments(ctx);
        }
        catch (e) {
            passError(event, e);
        }
    }
)