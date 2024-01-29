import { defineEventHandler } from 'h3';
export default cachedEventHandler(async (event) => {
    try{
        const { context } = parseCookies(event)

        const query       = getQuery(event)


        const headers = {
            Cookie: `context=${encodeURIComponent(JSON.stringify(context || query || {}))};`,
        }

        const [absch, bch, menus, nr, nrSix, nbsap, nfps, contentTypes,  forums  ] = await Promise.all([
            $fetch('/api/menus/absch', { query, method:'get', headers }),
            $fetch('/api/menus/bch', { query, method:'get', headers }),
            useMenus (query),
            $fetch('/api/menus/nr', { query, method:'get', headers }),
            $fetch('/api/menus/nr6', { query, method:'get', headers }),
            $fetch('/api/menus/nbsap', { query, method:'get', headers }),
            $fetch('/api/menus/focal-points', { query, method:'get', headers }),

            useContentTypeMenus(parseContext(context || query )),

            useDrupalTopicMenus(parseContext(context || query ))
        ]);



        return { ...menus, absch, bch, nr, nrSix, nbsap, nfps, contentTypes, forums }
    }
    catch(e){
        console.error('/api/menus--------------------------',e)
        throw createError({
            statusCode: 500,
            statusMessage: '/api/menus/index: Failed to  query the drupal menus',
        }) 
    }
    
},{
    maxAge: 1,
    getKey
})