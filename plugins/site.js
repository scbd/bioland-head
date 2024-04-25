// import {  useSiteStore } from "~/stores/site";
// import {  usePageStore } from "~/stores/page";
// import {  useMenusStore } from "~/stores/menus";

import vClickOutside from "click-outside-vue3";
import clone from 'lodash.clonedeep';

export default defineNuxtPlugin(async (nuxtApp) => {


    nuxtApp.vueApp.use(vClickOutside);

    const siteStore = useSiteStore(nuxtApp.$pinia);
    const menuStore = useMenusStore(nuxtApp.$pinia);
    const context   = useCookie('context');
    const route     = useRoute();


    const id         = getBiolandSiteIdentifier ();
    const locale     = unref(nuxtApp.$i18n.locale);
    const uri        = `/api/context/${id}/${locale}`;
    const rtPublic   = useRuntimeConfig().public;

    const { data } = await useFetch(uri)


    siteStore.initialize({ ...rtPublic, ...data.value, locale}) ;
    //context.value = { ...rtPublic, ...data.value, locale }; //path:route.path
    context.value = { ...siteStore.params, locale }; 
  
//     consola.log('context.value',context.value )
// consola.log('siteStore.params',siteStore.params )

  ensureContext(siteStore.params)// const { data:menuData } = await useFetch(`/api/menus`, { params: clone({...siteStore.params, path:route.path})});
//  if()
    const { data:menuData } = await useFetch(`/api/menus`, { params: clone({...siteStore.params, path:route.path})});

    await menuStore.loadAllMenus(menuData.value);

    nuxtApp.hook('i18n:localeSwitched', async ({oldLocale, newLocale}) => {
        const context       = useCookie('context');
        const localeChanged = newLocale === siteStore.defaultLocale ? 'en' : newLocale;

        siteStore.set('locale', localeChanged);

        context.value = siteStore.params;

        menuStore.loadAllMenus((await useFetch(`/api/menus`,{ params: clone(siteStore.params) })).data.value)
    })


    //middleware before every route change

    const  setAppStates = async (to, from)=>{

        const pStore      = usePageStore(nuxtApp.$pinia);


        if(to.path.startsWith('/zh-hans')) 
            return navigateTo({ path: to.path.replace('/zh-hans', '/zh'), query: to.query });
        if(to.path.endsWith('node/18'))
            return navigateTo({ path: to.path.replace('/node/18', '/'), query: to.query });
        if(to.path.endsWith('node/25'))
            return navigateTo({ path: to.path.replace('/node/25', '/search'), query: to.query });
        if(to.path.endsWith('node/87'))
            return navigateTo({ path: to.path.replace('/node/87', '/search/secretariat'), query: to.query });
        if(to.path.endsWith('node/88'))
            return navigateTo({ path: to.path.replace('/node/88', '/news-and-updates'), query: to.query });
        if(to.path.endsWith('node/90'))
            return navigateTo({ path: to.path.replace('/node/90', '/forums'), query: to.query });

        const isNewLocale = isLocaleChange(to, from) && !!pStore.drupalInternalNid;

        const localePath  = siteStore.locale === siteStore.defaultLocale? '' : `/${siteStore.locale}`;
        const path        = isNewLocale? `${localePath}/node/${pStore.drupalInternalNid}` : to.path;

        context.value.path = path;

        const pData = (await getPage(path)).value;

        pStore.initialize(pData)
    }

    addRouteMiddleware('bioland-route-change',  async (to, from) => setAppStates(to, from), { global: true });


    function getPage(passedPath){
        const path = passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath;
        const { drupalMultisiteIdentifier } = useRuntimeConfig().public;
        const { identifier,  locale } = siteStore;

        const key = `${drupalMultisiteIdentifier}-${identifier}-${locale}`;

        return useFetch(`/api/page/${key}/${encodeURIComponent(path)}`, {  method: 'GET', params: clone({ ...siteStore.params, path }) }).then(({ data }) => data);
    }


    function getBiolandSiteIdentifier () {
        const hostName = useRequestURL().hostname;

        if(!hostName || hostName.split('.').length <= 1)
            return  'demo';
    console.log('===========plugins/site.getBiolandSiteIdentifier',hostName.split('.'))
        return hostName.split('.')[0];
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

function ensureContext(ctx = {}){
    const hasContext = ctx.siteCode && ctx.locale && ctx.host && (ctx.country || ctx.countries?.length)

    if(!hasContext)
            throw new Error('plugins/site: Context not derived');
    
}