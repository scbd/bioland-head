import { internalQuery } from '../../utils/merge-query-into-context';
export default defineEventHandler(async (event) => {
        try{

            const   query   = getQuery(event)
            const   ctx     = await useRequestContext(event);


            const headers = { Cookie: getHeader(event, 'Cookie')};

            const { siteCode, localizedHost } = ctx;
            const   forwarded = internalQuery(ctx, query);

            if(!siteCode || localizedHost.includes('undefined')) throw createError({ statusCode: 404, statusMessage: 'Server.drupal.menus.index-bch: no context derived' });

            // A Drupal menu failure is not cached (see below); this short in-process backoff
            // stops every request during the outage from firing the full fan-out again.
            if (isBackingOff(`menus:${siteCode}`))
                throw createError({ statusCode: 503, statusMessage: 'Menus temporarily unavailable', data: { siteCode, reason: 'menus-failure-backoff' } });
            
            const allRequests = (await Promise.allSettled([
                $fetch('/api/menus/bch',           $fetchBaseOptions({ query: forwarded, method:'get', headers })),
                $fetch('/api/menus/drupal',        $fetchBaseOptions({ query: forwarded, method:'get', headers })),
                $fetch('/api/menus/content-types', $fetchBaseOptions({ query: forwarded, method:'get', headers })),
                $fetch('/api/menus/languages',     $fetchBaseOptions({ query: forwarded, method:'get', headers })),
                $fetch('/api/menus/system-pages',  $fetchBaseOptions({ query: forwarded, method:'get', headers }))
            ]))
            const rejected = allRequests.filter(({ status }) => status === 'rejected');

            for (const { reason } of rejected)
                consola.error('menus/index.js index - ', { name: reason?.name, message: reason?.message, status: reason?.status ?? reason?.statusCode ?? reason?.response?.status });

            // See index-chm: a failed Drupal menu must not be cached as an empty nav.
            if (allRequests[1].status === 'rejected') {
                rememberFailure(`menus:${siteCode}`, MENUS_FAILURE_BACKOFF_MS);
                throw allRequests[1].reason;
            }

            const [  bch, menus, contentTypes,  languages, systemPages] = allRequests.map(({ value }) => value || []);

            return { ...menus,  bch, contentTypes, languages, systemPages    }
        }
        catch (e) {

            passError(event, e);
        }
    }
)
