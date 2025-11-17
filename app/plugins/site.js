import vClickOutside from 'click-outside-vue3';
import isPlainObject from 'lodash.isplainobject';
import { createVfm } from 'vue-final-modal';


import clone from 'lodash.clonedeep';

export default defineNuxtPlugin({
    name: 'site',
    dependsOn: ['i18n:plugin'],
    async setup (nuxtApp){
        const vfm = createVfm();
        
        nuxtApp.vueApp.use(vClickOutside);
        nuxtApp.vueApp.use(vfm);

        const runTime   = useRuntimeConfig().public;
        const context   = useCookie('context');
        
        // Safely get locale with fallback
        let locale;
        try {
            const i18n = useI18n();
            locale = i18n.locale;
        } catch (e) {
            // Fallback if i18n is not ready
            locale = ref('en');
        }
        
        const hostName = useRequestURL().hostname;


        await getSiteContext();


        async function getSiteContext(paddedLocale = locale){
            try{
                const siteStore     = useSiteStore(nuxtApp.$pinia);
                const locale        = sanitizeLocale(unref(paddedLocale))
                const id            = getBiolandSiteIdentifier();
                const uri           = `/api/context/${id}/${unref(locale)}`;

                const data       = await $fetch(uri);

                const i18nStrategy  = runTime?.i18n?.strategy || 'prefix';
                const runTimePublic = clone(runTime);

                delete(runTimePublic.locales);
                delete(runTimePublic.i18n);

                siteStore.initialize({ ...runTimePublic,i18nStrategy,...(data|| {}), locale}) ;

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

        
            const { locales } = runTime;
            const   preFixes  = locales.map(({ code })=> code);
        
            const isValid     = preFixes.includes(locale);
        
            if(!isValid) return defaultLocale;

            return locale;
        }

        function getBiolandSiteIdentifier () {
            

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
                if(isPlainObject(context.value))
                    context.value[key] = updateCtx[key];
                else if(context.value[key] && context.value[key] !== updateCtx[key])
                    context.value[key] = updateCtx[key];
        }

        nuxtApp.hook('i18n:beforeLocaleSwitch', async ({ oldLocale, newLocale }) => {
            if(oldLocale === newLocale) return;

            const menuStore = useMenusStore(nuxtApp.$pinia);
            const siteStore = useSiteStore(nuxtApp.$pinia);

            siteStore.set('locale', newLocale);

            updateAppConfig(siteStore.params);

            const ctx = await getSiteContext(newLocale);

            updateAppConfig(ctx);

            $fetch(`/api/menus`,{ params: clone(siteStore.params) })
            .then((data)=>menuStore.loadAllMenus(data));

        })
    }
});



function ensureContext(ctx = {}){
    const hasContext = ctx.siteCode && ctx.locale && ctx.host;

    if(!hasContext)
            throw new Error('plugins/site: Context not derived');
    
}


