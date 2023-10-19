import { getBiolandSiteIdentifier } from "~/util";
import {  useSiteStore } from "~/stores/site";
import {  useMenusStore } from "~/stores/menus";

import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    nuxtApp.vueApp.use(vClickOutside);

    const siteStore = useSiteStore(nuxtApp.$pinia);
    const menuStore = useMenusStore(nuxtApp.$pinia);

    await siteStore.initialize(nuxtApp);
    await menuStore.loadAllMenus();

    siteStore.watchLocaleChange(nuxtApp, [menuStore.loadAllMenus]);
    // const pageData          = useState('pageData', undefined);
    // const hasHeroImage      = useState('hasHeroImage', undefined);

    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    async function setAppStates(to){
        siteStore.set('pagePath',to.path);
        // consola.warn('translation change');
        // pagePath.value = to.path;
        
        // consola.info('pagePath',to.path)
        // const { uuid, id, type, bundle } = await usePageIdentifiers(pagePath);
        // //  getPageData({ uuid, id, type, bundle });
        // consola.info('usePageIdentifiers',{ uuid, id, type, bundle } )

        // hasHeroImage.value = await useHasHeroImage(pagePath);
    }



});

