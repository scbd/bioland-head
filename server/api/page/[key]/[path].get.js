

export default defineEventHandler(async (event) => {
        try{

            const path = decodeURIComponent(getRouterParam(event, 'path'));
            const ctx  =  getContext(event);


            return  getPageData({...ctx, path}, event);
        }
        catch (e) {
            passError(event, e);
        }
    }
)
