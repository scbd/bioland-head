import { getBiolandSiteIdentifier } from "~/util";
import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    nuxtApp.vueApp.use(vClickOutside);
    const siteIdentifier = useState('siteIdentifier', undefined);
    const pagePath       = useState('pagePath', undefined);

    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    function setAppStates(to){
        const { hostname } = useRequestURL();

        if(!siteIdentifier.value)
            siteIdentifier.value = getBiolandSiteIdentifier(hostname) || 'seed';

        pagePath.value = to.path;
    }
});