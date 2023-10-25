import {  useSiteStore } from "~/stores/site";
import {  usePageStore } from "~/stores/page";
import {  useMenusStore } from "~/stores/menus";

import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    nuxtApp.vueApp.use(vClickOutside);

    const siteStore = useSiteStore(nuxtApp.$pinia);
    const menuStore = useMenusStore(nuxtApp.$pinia);

    await siteStore.initialize(nuxtApp);
    await menuStore.loadAllMenus();

    siteStore.watchLocaleChange(nuxtApp, [menuStore.loadAllMenus]);

    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    async function setAppStates(to){
        const pageStore = usePageStore(nuxtApp.$pinia);
        pageStore.set('path',to.path);
        pageStore.initialize(await usePageData())
    }

});

