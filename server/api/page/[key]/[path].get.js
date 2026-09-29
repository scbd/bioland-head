

export default defineEventHandler(async (event) => {
        try{

            const path = decodeURIComponent(getRouterParam(event, 'path'));
            const ctx  = await useRequestContext(event);


            return await getPageData({...ctx, path}, event);
        }
        catch (e) {
            return passError(event, e);
        }
    }
)
