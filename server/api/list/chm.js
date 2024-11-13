export default cachedEventHandler(async (event) => {
        try{
            const query            = getQuery   (event);
            const ctx              = getContext (event);

            const sdgList = {};

            let index =1
            for (const key in sdgsData) {
                const name    = `sdg${index}Name`;
                const altName = `sdg${index}AltName`;
                sdgList[sdgsData[key].identifier] = sdgsData[key].name;
                sdgList[sdgsData[key].identifier+'Alt'] = sdgsData[key].alternateName;

                index++
            }

            return useScbdIndex ({ ...ctx, ...query });
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/list/chm.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/list/chm.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    },
    externalCache
)
