export default defineEventHandler(async (event) => {
    try{
        const {dmsm, multiSiteCode } =useRuntimeConfig().public;

        const [d, s, p] = await Promise.all([
            $fetch(`${dmsm}/config/dev/${multiSiteCode}`, $fetchBaseOptions()),
            $fetch(`${dmsm}/config/stg/${multiSiteCode}`, $fetchBaseOptions()),
            $fetch(`${dmsm}/config/prod/${multiSiteCode}`, $fetchBaseOptions())
        ])


        return  makeSections({ dev: d, stg: s, prod: p });
    }
    catch (e) {
        passError(event, e);
    }

    function makeSections(data){
        const sections = [];
        const { dev:devPassed, stg:stgPassed, prod:prodPassed } = data;


        for (const [envToken, envPassed]  of [['dev', devPassed], ['stg', stgPassed], ['prod', prodPassed]]) {
            const scbd = { name: 'SCBD sites', sites: [], config: envPassed.config };
            const published = { name: 'Published sites', sites: [] , config: envPassed.config };
            const prePublished = { name: 'Pre-Published sites', sites: [], config: envPassed.config  };

            for (const siteCode in envPassed.sites) {
                const site = envPassed.sites[siteCode];

                // `site.host` is this Site's canonical absolute origin (scheme + hostname, no path).
                // It stays the generated Host `https://<siteCode>.<baseHost>` until DMSM supplies a
                // per-Site `redirect` hostname and the env gate flips to the real `prod` token, so
                // every value computed here today is byte-identical to the formula it replaces.
                site.host = getCanonicalHost({ siteCode: site.siteCode, baseHost: envPassed.config?.baseHost, env: envToken, redirect: site.redirect });

                if (site.scbd){
                    scbd.sites.push(site);
                    continue;
                }

                if (site.published)
                    published.sites.push(site);
                else 
                    prePublished.sites.push(site);
                
            }

            if(prePublished?.sites)
                prePublished.sites = prePublished.sites.filter(Boolean).sort((a,b)=> sortArrayOfObjectsByProp(b,a,'siteCode'));
            
            if(scbd?.sites)
                scbd.sites = scbd.sites.filter(Boolean).sort((a,b)=> sortArrayOfObjectsByProp(b,a,'siteCode'));

            if(published?.sites)
                published.sites = published.sites.filter(Boolean).sort((a,b)=> sortArrayOfObjectsByProp(b,a,'siteCode'));

            sections.push( { published, scbd,  prePublished});
        }

        const [dev, stg, prod] = sections;

        return { dev, stg, prod } 
    }
})
