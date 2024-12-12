export const useSiteStore = defineStore('site', {
    state: () => ({ i18nStrategy: 'prefix', locale  : undefined, identifier                : undefined, siteCode                  : undefined, pageIdentifiers           : undefined, defaultLocale             : undefined, gaiaApi                   : undefined, drupalMultisiteIdentifier : undefined, multiSiteCode             : undefined, baseHost                  : undefined, logo                      : undefined, config                    : undefined, name                      : undefined, redirect                  : undefined, drupalInternalRevisionId : undefined, }),
    actions:{
        set(name, value){
            this.$patch({ [name]: unref(value) } );

            return this;
        },
        initialize( { locale, identifier,siteCode, defaultLocale, config, siteName, gaiaApi, multiSiteCode, baseHost, env }){
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
        },
        getHost(ignoreLocale = false){
            const { locale, siteCode, baseHost, redirect } = this;
        
            const pathLocale = ignoreLocale? '' : `/${locale}`;
            const base       = redirect    ? `https://${redirect}` : `https://${encodeURIComponent(siteCode)}.${encodeURIComponent(baseHost)}`;
        
            return `${base}${pathLocale}`;
        }
    },
    getters:{
        allLocales(){
            return [...Array.from(new Set([this?.config?.defaultLocale, ...this?.config?.locales|| [] ] || []))];
        },
        getLogoUri(){
            const config     = this.config;
            const hasCountry = config?.country || (config?.countries? config?.countries[0] : undefined);

            if(config?.logo)  return config.logo;
        
            if(hasCountry) return `https://www.cbd.int/images/flags/96/flag-${hasCountry}-96.png`
        
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
        }
    }
});