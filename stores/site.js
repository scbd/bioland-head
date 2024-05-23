export const useSiteStore = defineStore('site', {
    state: () => ({  locale  : undefined, identifier                : undefined, siteCode                  : undefined, pageIdentifiers           : undefined, defaultLocale             : undefined, gaiaApi                   : undefined, drupalMultisiteIdentifier : undefined, multiSiteCode             : undefined, baseHost                  : undefined, logo                      : undefined, config                    : undefined, name                      : undefined, redirect                  : undefined, drupalInternalRevisionId : undefined, }),
    actions:{
        set(name, value){

            //if(!Object.keys(initState).includes(name)) throw new Error(`useSiteStore.set -> State ${name} is not defined`);
        
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
            this.set('defaultLocale',             defaultLocale);
        
            this.set('config', config);
            this.set('logo',   this.getLogoUri);
            this.set('name',   siteName);
            this.set('redirect', env === 'production'? config.redirect : '');
        },
        getHost(ignoreLocale = false){
    
            const { locale, siteCode, baseHost, defaultLocale, redirect } = this;
        
            const pathLocale = ignoreLocale? '' : this.drupalizePathLocales(locale, defaultLocale);
            const base       = redirect    ? `https://${redirect}` : `https://${encodeURIComponent(siteCode)}.${encodeURIComponent(baseHost)}`;
        
            return `${base}${pathLocale}`;
        },
        drupalizePathLocales(locale, defaultLocale){
            const drupalLocaleMap = new Map([['/zh','/zh-hans']]);
            
            if(!defaultLocale || !locale) return '';
        
            const pathPreFix = locale === defaultLocale? '' : `/${locale}`;
        
            if(!pathPreFix) return pathPreFix;
        
            const keys = drupalLocaleMap.keys();
        
            for (const aKey of keys)
                if(pathPreFix.startsWith(aKey))
                    return pathPreFix.replace(aKey,drupalLocaleMap.get(aKey))
        
            return pathPreFix;
        }
    },
    getters:{
        isDefaultLocale(){
            return this.locale === this.defaultLocale
        },
        getLogoUri(){
            const config = this.config
            const hasCountry = config?.country || (config?.countries? config?.countries[0] : undefined)
        
            if(config?.logo)  return config.logo;
        
            if(hasCountry) return `https://www.cbd.int/images/flags/96/flag-${hasCountry}-96.png`
        
            return 'https://seed.chm-cbd.net/sites/default/files/images/country/flag/xx.png'
        },
        host(){
            return this.getHost(true)
        },
        localizedHost(){
            return this.getHost()
        },
        drupalApiUriBase(){
            return this.getHost()
        },
        params(){
            const { identifier, baseHost, siteCode, config, locale, defaultLocale, host, localizedHost, redirect } = this;
            const { country:c, countries:cs } = config || {};
            const countries = this?.countries?.length?  this?.countries :(cs?.length? Array.from(new Set([c, ...cs])) : c? [c] : []).filter(x=>x && x !== 'undefined');
        
        
            return { baseHost, siteCode,identifier, country:c, locale, defaultLocale, countries, redirect, host, localizedHost };
        },
        countries(){
            const { config } = this;
        
            const countries = config?.countries || config?.runtime?.countries || [];
            const country   = config?.country? [config?.country] : []
        
            return Array.from(new Set([  ...country , ...countries ])).filter(x=>x && x !== 'undefined');
        },

        primaryColor(){
            return this.config?.theme?.color?.primary || this.config?.runTime?.color?.primary || '#009edb';
        },
        secondaryColor(){
            return this.config?.theme?.color?.secondary || this.config?.runTime?.color?.secondary ;
        },
        theme(){
            return this.config?.theme || this.config?.runTime?.theme || {};
        }
        
    }
});