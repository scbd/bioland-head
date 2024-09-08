import vClickOutside from "click-outside-vue3";
// import { createVfm } from 'vue-final-modal'

import clone from 'lodash.clonedeep';

export default defineNuxtPlugin({
    name: 'site',
    async setup (nuxtApp){
        // const vfm = createVfm();

        nuxtApp.vueApp.use(vClickOutside);
        // nuxtApp.vueApp.use(vfm);

        const siteStore = useSiteStore(nuxtApp.$pinia);
        const menuStore = useMenusStore(nuxtApp.$pinia);
        const meStore   = useMeStore(nuxtApp.$pinia);
        const context   = useCookie('context');
        const locale    = unref(nuxtApp.$i18n.locale);
        const rtPublic  = useRuntimeConfig().public;

        await getSiteContext();

        // addRouteMiddleware((to, from) => {

        // })

        nuxtApp.hook('i18n:localeSwitched', ({oldLocale, newLocale}) => {
            siteStore.set('locale', newLocale);

            context.value = { ...context.value,...siteStore.params }

            useFetch(`/api/menus`,{ params: clone(siteStore.params) }).then(({data})=>menuStore.loadAllMenus(data.value))
        })

        async function getSiteContext(){
            const id         = getBiolandSiteIdentifier ();
            const uri        = `/api/context/${id}/${locale}`;
            const { data }   = await useFetch(uri)

            siteStore.initialize({ ...rtPublic, ...data.value, locale}) ;
        
            context.value = { ...siteStore.params, locale }; 
            ensureContext(siteStore.params);


        }

        function getBiolandSiteIdentifier () {
            const hostName = useRequestURL().hostname;

            if(!hostName || hostName.split('.').length <= 1)
                return  'demo';

            return hostName.split('.')[0];
        }

        async function pageMiddleware(to, from){
            await getMe();

            const path = to.path; 

            if(!context.value) context.value = {};
                context.value.path = path;
            
            const { identifier,  locale, multiSiteCode } = siteStore;
        
            const key = `${multiSiteCode}-${identifier}-${locale}-${encodeURIComponent(path)}`;
        
            return getPage(key, path);
        }

        async function getMe(){
            if(meStore.isAuthenticated  && !meStore.isExpired ) return;
        
            const { data, error } = await useFetch(`/api/me`, {  method: 'GET', query: clone({...siteStore.params, path:to.path})})//.then(({ data }) => data);
        
            if(!error.value) meStore.initialize(data)
        }

        async function getMenus(){
            if(menuStore.isLoaded) return undefined;
        
            return useFetch(`/api/menus`, { query: clone({...siteStore.params, path:to.path})})
        }

    }
});



function ensureContext(ctx = {}){
    const hasContext = ctx.siteCode && ctx.locale && ctx.host //&& (ctx.country || ctx.countries?.length)

    if(!hasContext)
            throw new Error('plugins/site: Context not derived');
    
}


