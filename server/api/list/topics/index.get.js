export default defineEventHandler(async (event) => {
        try{
            const query             = getQuery      (event);
            const ctx               = getContext    (event);

            return useDrupalTopicMenus({...ctx,...query});
        }
        catch (e) {
            passError(event, e);
        }
    }
)
