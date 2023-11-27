import {  useSiteStore } from "~/stores/site";
import {  usePageStore } from "~/stores/page";
import {  useMenusStore } from "~/stores/menus";

import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    nuxtApp.vueApp.use(vClickOutside);

    const siteStore = useSiteStore(nuxtApp.$pinia);
    const menuStore = useMenusStore(nuxtApp.$pinia);


    const { identifier, defaultLocale, config, siteName } = await siteStore.getInitialContext(nuxtApp.$i18n.locale);


    await siteStore.initialize(nuxtApp,{ identifier, defaultLocale, config, siteName });
    const { params } = siteStore;

    // consola.error('params', params)

    const context = useCookie('context');

    context.value = params

    const { data } = await useFetch(`/api/menus`,{ params });

    await menuStore.loadAllMenus(data.value);

    nuxtApp.hook('i18n:localeSwitched', async ({oldLocale, newLocale}) => {
        const localeChanged = newLocale === siteStore.defaultLocale ? 'und' : newLocale;

        params.locale = localeChanged;
        context.value.locale = localeChanged;
        menuStore.loadAllMenus((await useFetch(`/api/menus`,{ params })).data.value)
    })


    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    async function setAppStates(to){
        const pageStore = usePageStore(nuxtApp.$pinia);

        pageStore.set('path',to.path);
        pageStore.initialize(await usePageData())
    }

});

