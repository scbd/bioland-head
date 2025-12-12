export default defineEventHandler(async (event) => {
        try{
            const query             = getQuery      (event);
            const ctx               = await useRequestContext(event);

            return useDrupalTopicMenus({...ctx,...query});
        }
        catch (e) {
            passError(event, e);
        }
    }
)
