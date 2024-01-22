import { defineStore } from 'pinia'


const actions = { getHost, set, initialize, getInitialContext };
const getters = { drupalApiUriBase, host, localizedHost, params, countries, isDefaultLocale };

export const useSiteStore = defineStore('site', { state, actions, getters,  persist: true, });

const initState = { 
                    locale                    : undefined,
                    identifier                : undefined,
                    pageIdentifiers           : undefined,
                    defaultLocale             : undefined,
                    gaiaApi                   : undefined,
                    drupalMultisiteIdentifier : undefined,
                    baseHost                  : undefined,
                    logo                      : undefined,
                    hasFlag                   : undefined,
                    config                    : undefined,
                    name                      : undefined,
                    hasNationalReportSix      : undefined,
                    redirect                  : undefined,
                    drupalInternalRevisionId : undefined,
                   
                }

function state(){ return initState }



function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useSiteStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}

async function initialize(nuxtApp, { identifier, defaultLocale, config, siteName }){
    const { gaiaApi, drupalMultisiteIdentifier, baseHost, env }   = useRuntimeConfig().public;

    this.set('baseHost', baseHost);
    this.set('gaiaApi', gaiaApi);
    this.set('drupalMultisiteIdentifier', drupalMultisiteIdentifier);
    this.set('locale', nuxtApp.$i18n.locale);
    this.set('identifier', identifier);
    this.set('defaultLocale', defaultLocale);

    this.set('config', config);
    this.set('logo', getLogoUri(config));
    this.set('name', siteName);
    this.set('redirect', env === 'production'? config.redirect : '');
}   



async function getInitialContext(locale){
    try{

        const identifier = getBiolandSiteIdentifier(useRequestURL().hostname) || 'seed';

        const uri        = `/api/context/${identifier}/${unref(locale)}`
    
        const { data, error } = await useFetch(uri)
    
        return data?.value
    }catch(e){
        consola.error('getInitialContext',e)
    }
}

function isDefaultLocale(){
    return this.locale === this.defaultLocale
}

function getLogoUri(config){
    const hasCountry = config.country || (config?.countries? config?.countries[0] : undefined)

    if(config.logo)  return config.logo;

    if(hasCountry) return `https://www.cbd.int/images/flags/96/flag-${hasCountry}-96.png`

    return 'https://seed.chm-cbd.net/sites/default/files/images/country/flag/xx.png'
}

// TODO
// get country name from server translated

function host(){
    return this.getHost(true)
}

function localizedHost(){
    return this.getHost()
}

function drupalApiUriBase(){
    return this.getHost()
}

function getHost(ignoreLocale = false){
    
    const { locale, identifier, baseHost, defaultLocale, redirect } = this;

    const pathLocale = ignoreLocale? '' : drupalizePathLocales(locale, defaultLocale);
    const base       = redirect? `https://${redirect}` : `https://${encodeURIComponent(identifier)}${encodeURIComponent(baseHost)}`;

    return `${base}${pathLocale}`;
}

function params(){
    const { identifier, config, locale, defaultLocale, host, localizedHost, redirect } = this;
    const { country:c, countries:cs } = config;
    const countries = cs?.length? Array.from(new Set([c, ...cs])): [c];

    return { identifier, country:c, locale, defaultLocale, countries, redirect, host, localizedHost };
}

function countries(){
    const { config } = this;

    const countries = config?.countries || [];
    const country   = config?.country? [config?.country] : []

    return [  ...country , ...countries ];
}
const drupalLocaleMap = new Map([['/zh','/zh-hans']]);

function drupalizePathLocales(locale, defaultLocale){
    if(!defaultLocale || !locale) return '';

    const pathPreFix = locale === defaultLocale? '' : `/${locale}`;

    if(!pathPreFix) return pathPreFix;

    const keys = drupalLocaleMap.keys();

    for (const aKey of keys)
        if(pathPreFix.startsWith(aKey))
            return pathPreFix.replace(aKey,drupalLocaleMap.get(aKey))

    return pathPreFix;
}

function getBiolandSiteIdentifier (hostName) {
    if(hostName.split('.').length <= 1)
        return undefined;

    return hostName.split('.')[0];
}