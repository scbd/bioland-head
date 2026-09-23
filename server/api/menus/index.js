import { internalQuery } from '../../utils/merge-query-into-context';
export default defineCachedEventHandler(
    async (event) => {
        try {
            consola.debug('[server/api/menus/index.js] Menu request received');
            
            const { multiSiteCode } = useRuntimeConfig().public;
            const query             = getQuery(event);
            const ctx               = await useRequestContext(event);
            const forwarded         = internalQuery(ctx, query);
            const isBchSite         = ['bch', 'bsl'].includes(multiSiteCode) || ctx?.isBchSite || false;

            const headers = { Cookie: getHeader(event, 'Cookie') };

            const { siteCode, localizedHost } = ctx;

            // Thrown, not returned: a returned H3Error leaves res.statusCode at 200, so
            // defineCachedEventHandler would cache the error body as a successful response.
            if (!siteCode || localizedHost.includes('undefined'))
                throw createError({ statusCode: 404, statusMessage: 'Server.menus: no context derived', });

            if (isBchSite)
                return await $fetch( '/api/menus/index-bch', $fetchBaseOptions({ query: forwarded, method: 'get', headers }), );
            else
                return await $fetch( '/api/menus/index-chm', $fetchBaseOptions({ query: forwarded, method: 'get', headers }), );
        } catch (e) {
            consola.error(e);
            passError(event, e);
        }
    },
    // SWR on: with the composite now failing hard when Drupal's menu is down, serve the last
    // good nav past its maxAge and let nitro log the refresh error instead of 500ing the nav.
    getMenusCacheOptions('menus-index', true)
);
