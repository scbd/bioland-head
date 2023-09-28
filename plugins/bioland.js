import { getBiolandSiteIdentifier } from "~/util";

export default defineNuxtPlugin(async () => {
    const siteIdentifier = useState('siteIdentifier', undefined);
    const pagePath       = useState('pagePath', undefined);

    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(), { global: true });

    function setAppStates(){
        const { hostname, pathname } = useRequestURL();

        if(!siteIdentifier.value)
            siteIdentifier.value = getBiolandSiteIdentifier(hostname) || 'seed';

        pagePath.value = pathname;
    }
});