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



    const context = useCookie('context');

    context.value = siteStore.params

    const { data } = await useFetch(`/api/menus`, { params: siteStore.params });

    await menuStore.loadAllMenus(data.value);

    nuxtApp.hook('i18n:localeSwitched', async ({oldLocale, newLocale}) => {
        const context       = useCookie('context');
        const localeChanged = newLocale === siteStore.defaultLocale ? 'und' : newLocale;

        siteStore.set('locale', localeChanged);

        context.value = siteStore.params;

        menuStore.loadAllMenus((await useFetch(`/api/menus`,{ params: siteStore.params })).data.value)
    })


    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    async function setAppStates(to){
        const pageStore = usePageStore(nuxtApp.$pinia);

        context.value.path = to.path;
        pageStore.set('path',to.path);

        console.warn('to.path', to.path)
        pageStore.initialize((await getPage(to.path)).value)
    }

    function getPage(path){
        const { drupalMultisiteIdentifier } = useRuntimeConfig().public;
        const { identifier,  locale } = siteStore;

        const key = `${drupalMultisiteIdentifier}-${identifier}-${locale}`;

        return useFetch(`/api/page/${key}/${encodeURIComponent(path)}`, {  method: 'GET' }).then(({ data }) => data);
    }


});

