
export default defineEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            return getDrupalMenus({...ctx});
        }
        catch (e) {

            passError(event, e);
        }
    }
)
