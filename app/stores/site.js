export const useSiteStore = defineStore('site', {
    state: () => ({ i18nStrategy: 'prefix', locale  : undefined, identifier                : undefined, siteCode                  : undefined, pageIdentifiers           : undefined, defaultLocale             : undefined, gaiaApi                   : undefined, drupalMultisiteIdentifier : undefined, multiSiteCode             : undefined, baseHost                  : undefined, logo                      : undefined, logoDimensions            : undefined, config                    : undefined, name                      : undefined, redirect                  : undefined, drupalInternalRevisionId : undefined, biolandSettings: undefined, env: undefined, }),
    actions:{
        set(name, value){
            this.$patch({ [name]: unref(value) } );

            return this;
        },
        initialize( { biolandSettings, locale, identifier,siteCode, defaultLocale, config, siteName, gaiaApi, multiSiteCode, baseHost, env, homePath }){
            // `env` arrives on every context payload (server/api/context/[siteCode]/[locale].js:36)
            // but was previously dropped here. Persisting it lets client side consumers such as
            // isGoogleTagsSite() evaluate deployment eligibility. The existing `host` getter
            // already supplies the other half, so it stays untouched.
            this.set('env',                       env);
            this.set('baseHost',                  baseHost);
            this.set('gaiaApi',                   gaiaApi);
            this.set('drupalMultisiteIdentifier', multiSiteCode);
            this.set('multiSiteCode',             multiSiteCode);
            this.set('locale',                    locale);
            this.set('identifier',                identifier || siteCode);
            this.set('siteCode',                  identifier || siteCode);
            this.set('defaultLocale',             defaultLocale ||config?.defaultLocale);
        
            this.set('config', config);
            this.set('logo',   this.getLogoUri);
            this.set('name',   siteName);
            this.set('redirect', env === 'production'? config?.redirect || '' : '');
            this.set('homePath', homePath);

            if(biolandSettings)
                this.set('biolandSettings', biolandSettings);
            
            // Fetch logo dimensions asynchronously
            this.fetchLogoDimensions();
        },
        async fetchLogoDimensions() {
            const logoUrl = this.logo;
            if (!logoUrl) return;
            
            try {
                // Use Image API to get dimensions
                if (import.meta.client) {
                    const img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = () => {
                            this.set('logoDimensions', {
                                width: img.naturalWidth,
                                height: img.naturalHeight,
                                type: this.getImageTypeFromUrl(logoUrl)
                            });
                            resolve();
                        };
                        img.onerror = reject;
                        img.src = logoUrl;
                    });
                } else {
                    // For SSR, set default dimensions (will be updated on client)
                    this.set('logoDimensions', {
                        width: 96,
                        height: 96,
                        type: this.getImageTypeFromUrl(logoUrl)
                    });
                }
            } catch (error) {
                // Fallback to default dimensions if image loading fails
                this.set('logoDimensions', {
                    width: 96,
                    height: 96,
                    type: 'image/png'
                });
            }
        },
        getImageTypeFromUrl(url) {
            if (!url) return 'image/png';
            const ext = url.split('.').pop()?.toLowerCase();
            const typeMap = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'svg': 'image/svg+xml'
            };
            return typeMap[ext] || 'image/png';
        },
        getHost(ignoreLocale = false){
            const { locale, siteCode, baseHost, redirect } = this;
        
            // Guard against incomplete initialization during SSR
            if (!siteCode || !baseHost) return '';
        
            const pathLocale = ignoreLocale? '' : `/${locale}`;
            const base       = redirect    ? `https://${redirect}` : `https://${encodeURIComponent(siteCode)}.${encodeURIComponent(baseHost)}`;
        
            return `${base}${pathLocale}`;
        }
    },
    getters:{
        isPromoteAndStickyPublic(){
            const meStore = useMeStore();
            const hasRequiredRole = meStore.roles?.some(role => 
                ['administrator', 'scbd_staff', 'site_manager', 'content_manager', 'contributor'].includes(role)
            );
            
            if (hasRequiredRole) return true;
            
            return this.biolandSettings?.config?.promoteAndStickyPublic || false;
        },
        allLocales(){
            return [...Array.from(new Set([this?.config?.defaultLocale, ...this?.config?.locales|| [] ] || []))];
        },
        getLogoUri(){
            const config     = this.config;
            const hasCountry = config?.country || (config?.countries? config?.countries[0] : undefined);

            if(config?.logo)  return config.logo;
        
            if(hasCountry) return getFlagUrl(hasCountry)
        
            return 'https://seed.chm-cbd.net/sites/default/files/images/country/flag/xx.png'
        },
        host(){
            return this.getHost(true);
        },
        localizedHost(){
            return this.getHost();
        },
        params(){
            const { i18nStrategy, identifier, baseHost, siteCode, config, locale, defaultLocale, host, localizedHost, redirect } = this || {};
            const { country:c, countries:cs } = config || {};
            const   countries                 = this.countries || [];
            const   locales                   = this.allLocales;

            return {i18nStrategy,locales, baseHost, siteCode,identifier, country:c, locale, defaultLocale, countries, redirect, host, localizedHost };
        },
        countries(){
            const { config } = this || {};
        
            const countries = config?.countries || config?.runtime?.countries || [];
            const country   = config?.country? [config?.country] : [];
        
            return uniqueArray([  ...country , ...countries ]).filter(falsyFilter);
        },
        primaryColor(){
            return this.config?.theme?.color?.primary || this.config?.runTime?.theme?.color?.primary || '#009edb';
        },
        secondaryColor(){
            return this.config?.theme?.color?.secondary || this.config?.runTime?.theme?.color?.secondary ;
        },
        theme(){
            return this.config?.theme || this.config?.runTime?.theme || {};
        },
        maxLangBeforeWrap(){
            return this.config?.theme?.i18n?.maxLangBeforeWrap || this.config?.runTime?.theme?.i18n?.maxLangBeforeWrap  ;
        },
        isBiosafetySite(){
            return this.baseHost.includes('bsl') || this.baseHost.includes('biosafety') || this.baseHost.includes('bch');
        },
        isHomePage(){
            const route = useRoute();
            const path = route?.path;
            
            if (!path) return false;
            
            // Check if path matches root, locale root, or configured homePath
            return path === '/' || 
                   path === `/${this.locale}` || 
                   path === this.homePath;
        }
    }
});