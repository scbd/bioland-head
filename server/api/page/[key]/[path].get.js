

export default defineEventHandler(async (event) => {
        try{

            const path = decodeURIComponent(getRouterParam(event, 'path'));
            const ctx  = await useRequestContext(event);


            return  getPageData({...ctx, path}, event);
        }
        catch (e) {
            passError(event, e);
        }
    }
)
