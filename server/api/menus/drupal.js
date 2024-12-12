
export default defineEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return getDrupalMenus ({...context});
        }
        catch (e) {

            passError(event, e);
        }
    }
)
