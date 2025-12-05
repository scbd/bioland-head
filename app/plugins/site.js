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

        // Safely get locale with fallback and keep a setter on hand
        let i18nLocale = ref('en');
        let setLocale  = async (value) => { i18nLocale.value = value; };

        try {
            ({ locale: i18nLocale, setLocale } = useI18n());
        } catch (e) {
            // Fallback if i18n is not ready
            i18nLocale = ref('en');
        }

        const locale = ref(i18nLocale.value);
        const requestUrl = useRequestURL();
        const hostName   = requestUrl.hostname;
        const pathLocaleOverride = getLocaleFromPath(requestUrl.pathname);
        
        // ALWAYS fetch with 'und' first to get DMSM's authoritative defaultLocale
        // This ensures we never initialize with the wrong default, regardless of path or cookie
        const initialContext = await getSiteContext(undefined);
        
        // If user is on a specific locale path (e.g., /en, /ru), use that locale
        // Otherwise use DMSM's defaultLocale (e.g., 'es' for seed site)
        const currentLocale = pathLocaleOverride && 
                              initialContext.config?.locales?.includes(pathLocaleOverride)
                              ? pathLocaleOverride 
                              : initialContext.defaultLocale;
        
        // Update the store's locale to match the current path
        if (currentLocale !== initialContext.locale) {
            initialContext.locale = currentLocale;
        }

        await syncInitialLocale(initialContext, currentLocale);

        // Setup reactive html attributes based on locale
        const rtlLangs = ['ar', 'he', 'fa', 'ur', 'ku', 'am', 'az'];
        useHead(() => ({
            htmlAttrs: {
                lang: locale.value,
                dir: rtlLangs.includes(locale.value) ? 'rtl' : 'ltr'
            }
        }));

        async function getSiteContext(paddedLocale){
            try{
              const siteStore = useSiteStore(nuxtApp.$pinia);
              const requestedLocale = unref(paddedLocale);
              const id = getBiolandSiteIdentifier();
              
              // CRITICAL: Don't pass 'en' fallback - let server use DMSM defaultLocale
              // If no locale requested, use 'und' (undefined) to signal server to use default
              const fetchLocale = requestedLocale || 'und';
              const uri = `/api/context/${id}/${fetchLocale}`;
              
              const data = await $fetch(uri);
              
              if(!data?.defaultLocale) {
                throw new Error(`DMSM API did not return defaultLocale for site ${id}`);
              }
              
              // Use the locale from server response (which correctly uses DMSM default)
              const localeForFetch = data.locale;

              const i18nStrategy = runTime?.i18n?.strategy || "prefix";
              const runTimePublic = clone(runTime);

              delete runTimePublic.locales;
              delete runTimePublic.i18n;

              // Use DMSM values directly from server response
              const derivedDefaultLocale = data.defaultLocale;
              const resolvedLocale = data.locale; // Server already resolved this correctly

              siteStore.initialize({
                ...runTimePublic,
                i18nStrategy,
                ...(data || {}),
                locale: resolvedLocale,
                defaultLocale: derivedDefaultLocale,
              });

              ensureContext(siteStore.params);

              updateAppConfig(siteStore.params);

              return {
                ...runTimePublic,
                i18nStrategy,
                ...(data || {}),
                locale: resolvedLocale,
                defaultLocale: derivedDefaultLocale,
              };
            }catch(e){
                const id = getBiolandSiteIdentifier ();

                throw createError({ 
                    statusCode    : e.statusCode || 404, 
                    statusMessage : e.statusMessage || 'Not Found',
                    message       : `Not Found Plugins.site.getSiteContext: no context derived for site [${id}] locale [${unref(paddedLocale)}]`,
                    data:e,
                    fatal:true
                });
            }
        }

        async function syncInitialLocale(siteContext, overrideLocale){
            if(!siteContext) return;

            const targetLocale = overrideLocale
                ? sanitizeLocale(overrideLocale, siteContext.defaultLocale)
                : siteContext.defaultLocale || siteContext.locale;

            if(targetLocale && targetLocale !== i18nLocale.value)
                await setLocale(targetLocale);

            locale.value = targetLocale || locale.value;
        }

        function sanitizeLocale(locale, defaultLocale){
            if(!defaultLocale) {
                // If no defaultLocale is provided, we can't sanitize - return locale as-is
                // This should only happen during initial load before DMSM fetch
                return locale;
            }
        
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

            locale.value = newLocale;

            $fetch(`/api/menus`,{ params: clone(siteStore.params) })
            .then((data)=>menuStore.loadAllMenus(data));

        })

        function getLocaleFromPath(path = ''){
            const { locales } = runTime;
            const preFixes    = locales.map(({ code })=> code);
            const pathLocale  = path.split('/')[1];

            if(!pathLocale) return undefined;

            return preFixes.includes(pathLocale)? pathLocale : undefined;
        }
    }
});



function ensureContext(ctx = {}){
    const hasContext = ctx.siteCode && ctx.locale && ctx.host;

    if(!hasContext)
            throw new Error('plugins/site: Context not derived');
    
}

