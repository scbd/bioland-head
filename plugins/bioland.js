import {  useSiteStore } from "~/stores/site";
import {  usePageStore } from "~/stores/page";
import {  useMenusStore } from "~/stores/menus";

import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    nuxtApp.vueApp.use(vClickOutside);

    const siteStore = useSiteStore(nuxtApp.$pinia);
    const menuStore = useMenusStore(nuxtApp.$pinia);

    await siteStore.initialize(nuxtApp);


    const { params } = siteStore;

    const context = useCookie('context');

    context.value = params

    const { data } = await useFetch(`/api/menus`,{ params });

// consola.error('data', data)

    await menuStore.loadAllMenus(data.value);

    nuxtApp.hook('i18n:localeSwitched', async ({oldLocale, newLocale}) => {
        // consola.warn('i18n:localeSwitched', oldLocale, newLocale)
        const localeChanged = newLocale === siteStore.defaultLocale.locale ? 'und' : newLocale;
        params.locale = localeChanged;
        context.value.locale = localeChanged;
        menuStore.loadAllMenus((await useFetch(`/api/menus`,{ params })).data.value)
    })
    // siteStore.watchLocaleChange(nuxtApp, [menuStore.loadAllMenus]);

    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    async function setAppStates(to){
        const pageStore = usePageStore(nuxtApp.$pinia);

        pageStore.set('path',to.path);
        pageStore.initialize(await usePageData())
    }

});

