import { defineEventHandler } from 'h3';
export default defineEventHandler(async (event) => {
    try{
        const query = getQuery(event)
        const { context } = parseCookies(event)

        const headers = {
            Cookie: `context=${encodeURIComponent(JSON.stringify(context || {}))};`,
        }

        const [absch, bch, menus, nr, nrSix, nbsap, nfps, counts, contentTypes  ] = await Promise.all([
            $fetch('/api/menus/absch', { query, method:'get', headers }),
            $fetch('/api/menus/bch', { query, method:'get', headers }),
            useMenus (query),
            $fetch('/api/menus/nr', { query, method:'get', headers }),
            $fetch('/api/menus/nr6', { query, method:'get', headers }),
            $fetch('/api/menus/nbsap', { query, method:'get', headers }),
            $fetch('/api/menus/focal-points', { query, method:'get', headers }),
            useContentTypeCounts(parseContext(context)),
            useContentTypeMenus(parseContext(context))
        ]);

        // const menus = (await useMenus (query))

        return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, counts, contentTypes  }
    }
    catch(e){
        console.log('--------------------------',e)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the drupal menus',
        }) 
    }
    
})