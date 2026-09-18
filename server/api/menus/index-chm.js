export default defineEventHandler(async (event) => {
        try{

            const   query   = getQuery(event)
            const   ctx     = await useRequestContext(event);


            const headers = { Cookie: getHeader(event, 'Cookie')};

            const { siteCode, localizedHost } = { ...ctx, ...query };

            if(!siteCode || localizedHost.includes('undefined')) throw createError({ statusCode: 404, statusMessage: 'Server.drupal.menus.index-chm: no context derived' });

            // A Drupal menu failure is not cached (see below); this short in-process backoff
            // stops every request during the outage from firing the full fan-out again.
            if (isBackingOff(`menus:${siteCode}`))
                throw createError({ statusCode: 503, statusMessage: 'Menus temporarily unavailable', data: { siteCode, reason: 'menus-failure-backoff' } });
            
            const allRequests = (await Promise.allSettled([
                $fetch('/api/menus/absch',         $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/bch',           $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/drupal',        $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/nr',            $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/nr6',           $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/nbsap',         $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/focal-points',  $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/content-types', $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/topics',        $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/languages',     $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/system-pages',  $fetchBaseOptions({ query, method:'get', headers })),
                $fetch('/api/menus/nt7',           $fetchBaseOptions({ query, method:'get', headers }))
            ]))
            const rejected = allRequests.filter(({ status }) => status === 'rejected');

            for (const { reason } of rejected)
                consola.error('menus/index.js index - ', { name: reason?.name, message: reason?.message, status: reason?.status ?? reason?.statusCode ?? reason?.response?.status });

            // The Drupal menu is the navigation itself. If it failed, fail the composite so
            // /api/menus does not cache an empty nav for every container for CACHE_TTL.MENUS;
            // the other sources are optional and degrade to [].
            if (allRequests[2].status === 'rejected') {
                rememberFailure(`menus:${siteCode}`, MENUS_FAILURE_BACKOFF_MS);
                throw allRequests[2].reason;
            }

            const [ absch, bch, menus, nr, nrSix, nbsap, nfps, contentTypes,  forums , languages, systemPages, nt7 ] = allRequests.map(({ value }) => value || []);

            return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, contentTypes, forums, languages, menus, systemPages, nt7  }
        }
        catch (e) {

            passError(event, e);
        }
    }
)
