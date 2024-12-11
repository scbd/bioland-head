import vClickOutside from 'click-outside-vue3';
import isPlainObject from 'lodash.isplainobject';
import { createVfm } from 'vue-final-modal';


import clone from 'lodash.clonedeep';

export default defineNuxtPlugin({
    name: 'site',
    async setup (nuxtApp){
        const vfm = createVfm();
        
        nuxtApp.vueApp.use(vClickOutside);
        nuxtApp.vueApp.use(vfm);

        const runTime   = useRuntimeConfig().public;
        const siteStore = useSiteStore(nuxtApp.$pinia);
        const menuStore = useMenusStore(nuxtApp.$pinia);

        const context   = useCookie('context');
        const locale    = nuxtApp.$i18n.locale;
        const rtPublic  = useRuntimeConfig().public;

        await getSiteContext();

        nuxtApp.hook('i18n:beforeLocaleSwitch', async ({ oldLocale, newLocale }) => {
            siteStore.set('locale', newLocale);

            updateAppConfig(siteStore.params);

            const ctx = await getSiteContext(newLocale);

            updateAppConfig(ctx);

            useFetch(`/api/menus`,{ params: clone(siteStore.params) })
            .then(({data})=>menuStore.loadAllMenus(data.value));

        })

        async function getSiteContext(paddedLocale = locale){
            try{
                const locale        = sanitizeLocale(unref(paddedLocale))
                const id            = getBiolandSiteIdentifier();
                const uri           = `/api/context/${id}/${unref(locale)}`;
                const { data }      = await useFetch(uri);
                const i18nStrategy  = runTime?.i18n?.strategy || 'prefix';
                const runTimePublic = clone(rtPublic);

                delete(runTimePublic.locales);
                delete(runTimePublic.i18n);

                siteStore.initialize({ ...runTimePublic,i18nStrategy,...(data?.value|| {}), locale}) ;

                ensureContext(siteStore.params);

                updateAppConfig(siteStore.params);

                return { ...runTimePublic, i18nStrategy, ...data.value, locale};
            }catch(e){
                const id = getBiolandSiteIdentifier ();

                consola.error(e);

                throw createError({ 
                    statusCode    : e.statusCode || 404, 
                    statusMessage : e.statusMessage || 'Not Found',
                    message       : `Not Found Plugins.site.getSiteContext: no context derived for site [${id}] locale [${unref(paddedLocale)}]`,
                    data:e,
                    fatal:true
                });
            }
        }

        function sanitizeLocale(locale, defaultLocale = 'en'){

        
            const { locales } = useRuntimeConfig().public;
            const   preFixes  = locales.map(({ code })=> code);
        
            const isValid     = preFixes.includes(locale);
        
            if(!isValid) return defaultLocale;

            return locale;
        }

        function getBiolandSiteIdentifier () {
            const hostName = useRequestURL().hostname;

            if(!hostName)
                    throw createError({ 
                        statusCode: 404, 
                        statusMessage: 'Not Found Plugins.site.getBiolandSiteIdentifier: no host derived to find env site context.'
                    });

            if(hostName.split('.').length <= 1)
                        throw createError({ 
                            statusCode: 404, 
                            statusMessage: 'Not Found Plugins.site.getBiolandSiteIdentifier: no siteKey derived to find env site context.'
                        });

            return hostName.split('.')[0];
        }

        function updateAppConfig(updateCtx){
            if(!context.value || !isPlainObject(context.value)) context.value = {};
        
            for(const key in updateCtx)
                context.value[key] = updateCtx[key];
        }
    }
});



function ensureContext(ctx = {}){
    const hasContext = ctx.siteCode && ctx.locale && ctx.host;

    if(!hasContext)
            throw new Error('plugins/site: Context not derived');
    
}


