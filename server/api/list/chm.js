export default defineEventHandler(async (event) => {
        try{
            const query            = getQuery   (event);
            const ctx              = getContext (event);

            const sdgList = {};

            // let index =1
            // for (const key in sdgsData) {
            //     const name    = `sdg${index}Name`;
            //     const altName = `sdg${index}AltName`;
            //     sdgList[sdgsData[key].identifier] = sdgsData[key].name;
            //     sdgList[sdgsData[key].identifier+'Alt'] = sdgsData[key].alternateName;

            //     index++
            // }

            return queryScbdIndex ({ ...ctx, ...query });
        }
        catch (e) {
            passError(event, e);
        }
    },
    // externalCache
)
