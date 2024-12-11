export default defineEventHandler(async (event) => {
        try{

            const query             = getQuery      (event);
            const ctx               = getContext    (event);

            return useDrupalForums({...ctx,...query});
        }
        catch (e) {
            passError(event, e);
        }
    }
)
