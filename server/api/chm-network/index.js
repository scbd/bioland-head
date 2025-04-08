export default defineEventHandler(async (event) => {
    try{
        const {dmsm    } =useRuntimeConfig().public;

        const [d, s, p] = await Promise.all([
            $fetch(`${dmsm}/config/dev/bl2`, $fetchBaseOptions()),
            $fetch(`${dmsm}/config/stg/bl2`, $fetchBaseOptions()),
            $fetch(`${dmsm}/config/prod/bl2`, $fetchBaseOptions())
        ])


        return  makeSections({ dev: d, stg: s, prod: p });
    }
    catch (e) {
        passError(event, e);
    }

    function makeSections(data){
        const sections = [];
        const { dev:devPassed, stg:stgPassed, prod:prodPassed } = data;


        for (const env  of [devPassed, stgPassed, prodPassed]) {
            const scbd = { name: 'SCBD sites', sites: [], config: env.config };
            const published = { name: 'Published sites', sites: [] , config: env.config };
            const prePublished = { name: 'Pre-Published sites', sites: [], config: env.config  };

            for (const siteCode in env.sites) {
                const site = env.sites[siteCode];
                if (site.scbd){
                    scbd.sites.push(site);
                    continue;
                }

                if (site.published)
                    published.sites.push(site);
                else 
                    prePublished.sites.push(site);
                
            }
            sections.push( { published, scbd,  prePublished});
        }

        const [dev, stg, prod] = sections;

        return { dev, stg, prod } 
    }
})
