import {  useSiteStore } from "~/stores/site";
import {  usePageStore } from "~/stores/page";
import {  useMenusStore } from "~/stores/menus";

import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    const route    = useRoute();

    const pageStore = usePageStore(nuxtApp.$pinia);


    // consola.warn('defineNuxtPlugin', process.client)
    nuxtApp.vueApp.use(vClickOutside);

    const siteStore = useSiteStore(nuxtApp.$pinia);
    const menuStore = useMenusStore(nuxtApp.$pinia);


    const { identifier, defaultLocale, config, siteName } = await siteStore.getInitialContext(nuxtApp.$i18n.locale);


    await siteStore.initialize(nuxtApp,{ identifier, defaultLocale, config, siteName });



    const context = useCookie('context');

    context.value = {...siteStore.params, path:route.path};

    const { data } = await useFetch(`/api/menus`, { params: {...siteStore.params, path:route.path}});

    await menuStore.loadAllMenus(data.value);

    nuxtApp.hook('i18n:localeSwitched', async ({oldLocale, newLocale}) => {
        const context       = useCookie('context');
        const localeChanged = newLocale === siteStore.defaultLocale ? 'en' : newLocale;

        siteStore.set('locale', localeChanged);

        context.value = siteStore.params;

        menuStore.loadAllMenus((await useFetch(`/api/menus`,{ params: siteStore.params })).data.value)
    })


    //middleware before every route change

    const  setAppStates = async (to, from)=>{

        const pStore      = usePageStore(nuxtApp.$pinia);

        if(to.path.startsWith('/zh-hans')) 
            return navigateTo(to.path.replace('/zh-hans', '/zh'));
        
        const isNewLocale = isLocaleChange(to, from) && !!pStore.drupalInternalNid;

        
        const localePath  = siteStore.locale === siteStore.defaultLocale? '' : `/${siteStore.locale}`;
        const path        = isNewLocale? `${localePath}/node/${pStore.drupalInternalNid}` : to.path;

        context.value.path = path;

        const pData = (await getPage(path)).value;

        pStore.initialize(pData)
    }

    addRouteMiddleware('bioland-route-change',  async (to, from) => setAppStates(to, from), { global: true });


    function getPage(path){
        const { drupalMultisiteIdentifier } = useRuntimeConfig().public;
        const { identifier,  locale } = siteStore;

        const key = `${drupalMultisiteIdentifier}-${identifier}-${locale}`;

        return useFetch(`/api/page/${key}/${encodeURIComponent(path)}`, {  method: 'GET', params: { ...siteStore.params, path } }).then(({ data }) => data);
    }



});

function isLocaleChange({ name: to }, { name: from }){
   
    const toLocale   = getLocaleFromRouteName(to);
    const fromLocale = getLocaleFromRouteName(from);

    return toLocale !== fromLocale;
}

function getLocaleFromRouteName(name){
    const indexToSlice = name.lastIndexOf('_');
    return name.slice(indexToSlice + 1);
}