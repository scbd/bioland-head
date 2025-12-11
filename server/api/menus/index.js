export default defineEventHandler(async (event) => {
        try{
            const { multiSiteCode } = useRuntimeConfig().public;
            const   query           = getQuery(event);
            const   ctx             = await useRequestContext(event);
            const   context         = { ...ctx, ...query };
            const   isBchSite       = [ 'bch', 'bsl' ].includes(multiSiteCode) || context?.isBchSite || false;


            const headers = { Cookie: getHeader(event, 'Cookie')};

            const { siteCode, localizedHost } = context;

            if(!siteCode || localizedHost.includes('undefined')) return createError({ statusCode: 404, statusMessage: 'Server.menus: no context derived' });
            
 
            if(isBchSite)
                return $fetch('/api/menus/index-bch', $fetchBaseOptions({ query, method:'get', headers }));
            else 
                return $fetch('/api/menus/index-chm', $fetchBaseOptions({ query, method:'get', headers }));

        }
        catch (e) {

            passError(event, e);
        }
    }
)
