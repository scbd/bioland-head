import { defineStore } from 'pinia'



const actions = { getHost, set, initialize, getInitialContext }
const getters = { drupalApiUriBase, host, localizedHost, params, countries };



export const useSiteStore = defineStore('site', { state, actions, getters })

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
                    redirect                  : undefined
                }

function state(){ return initState }



function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useSiteStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}

async function initialize(nuxtApp, { identifier, defaultLocale, config, siteName }){
    const { gaiaApi, drupalMultisiteIdentifier, baseHost, env }   = useRuntimeConfig().public;

    // consola.error(await getInitialContext({  baseHost, gaiaApi, drupalMultisiteIdentifier, locale: nuxtApp.$i18n.locale })    );

    

    this.set('baseHost', baseHost);
    this.set('gaiaApi', gaiaApi);
    this.set('drupalMultisiteIdentifier', drupalMultisiteIdentifier);
    this.set('locale', nuxtApp.$i18n.locale);
    this.set('identifier', identifier);
    this.set('defaultLocale', defaultLocale);

    // const config = await this.getSiteConfig();

    this.set('config', config);
    this.set('logo', getLogoUri(config));
    this.set('name', siteName);
    this.set('redirect', env === 'production'? config.redirect : '');


}   



async function getInitialContext(locale){
    try{
        const { gaiaApi, drupalMultisiteIdentifier, baseHost, env }   = useRuntimeConfig().public;
        const identifier = getBiolandSiteIdentifier(useRequestURL().hostname) || 'seed';
        const params     = { identifier,  locale, gaiaApi, drupalMultisiteIdentifier, baseHost };
        const uri        = `/api/context`
    
        const { data, error } = await useFetch(uri, { params })
    
        return data?.value
    }catch(e){
        consola.error('getInitialContext',e)
    }

}


async function getSiteConfig(){
    const { identifier, gaiaApi, drupalMultisiteIdentifier } = this;

    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/configs/${identifier}`

    return $fetch(uri)
}

function getLogoUri(config){
    const hasCountry = config.country || (config?.countries? config?.countries[0] : undefined)

    if(config.logo)  return config.logo;

    if(hasCountry) return `https://www.cbd.int/images/flags/96/flag-${hasCountry}-96.png`

    return 'https://seed.chm-cbd.net/sites/default/files/images/country/flag/xx.png'
}

async function getDefinedName () {
    const host  = this.localizedHost;
    const query = {jsonapi_include: 1};
    const uri   = `${host}/jsonapi/site/site?api-key=636afe3fa6d502d3d7b01996b50add18`

    const resp = await $fetch(uri,{query})
    const name = resp?.data?.name

    return name === '_'? '' : name;
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
    const { country, countries } = config;

    return { identifier, country, locale, defaultLocale, countries, redirect, host, localizedHost };
}

function countries(){
    const { config } = this;

    const countries = config?.countries || [];
    const country   = config?.country? [config?.country] : []

    return [  ...country , ...countries ];
}
const drupalLocaleMap = new Map([['/zh','/zh-hans']]);

function drupalizePathLocales(locale, defaultLocale){
    if(!defaultLocale?.locale || !locale) return '';

    const pathPreFix = locale === defaultLocale?.locale? '' : `/${locale}`;

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