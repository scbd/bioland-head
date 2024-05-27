import vClickOutside from "click-outside-vue3";
import clone from 'lodash.clonedeep';

export default defineNuxtPlugin(async (nuxtApp) => {

    nuxtApp.vueApp.use(vClickOutside);

    const siteStore = useSiteStore(nuxtApp.$pinia);
    const context   = useCookie('context');

    const id         = getBiolandSiteIdentifier ();
    const locale     = unref(nuxtApp.$i18n.locale);
    const uri        = `/api/context/${id}/${locale}`;
    const rtPublic   = useRuntimeConfig().public;

    const { data } = await useFetch(uri)

    siteStore.initialize({ ...rtPublic, ...data.value, locale}) ;

    context.value = { ...siteStore.params, locale }; 

    ensureContext(siteStore.params);

    nuxtApp.hook('i18n:localeSwitched', async ({oldLocale, newLocale}) => {
        const context       = useCookie('context');
        const localeChanged = newLocale === siteStore.defaultLocale ? 'en' : newLocale;

        siteStore.set('locale', localeChanged);

        context.value = siteStore.params;

        menuStore.loadAllMenus((await useFetch(`/api/menus`,{ params: clone(siteStore.params) })).data.value)
    })


    function getBiolandSiteIdentifier () {
        const hostName = useRequestURL().hostname;

        if(!hostName || hostName.split('.').length <= 1)
            return  'demo';

        return hostName.split('.')[0];
    }

});



function ensureContext(ctx = {}){
    const hasContext = ctx.siteCode && ctx.locale && ctx.host //&& (ctx.country || ctx.countries?.length)

    if(!hasContext)
            throw new Error('plugins/site: Context not derived');
    
}
