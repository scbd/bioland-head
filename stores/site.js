import { defineStore } from 'pinia'
import { getBiolandSiteIdentifier } from "~/util";

const actions = { set, initialize, getSiteDefaultLocale, watchLocaleChange, getSiteConfig, getDefinedName  }

export const useSiteStore = defineStore('site', { state, actions })

const initState = { 
                    locale                   : undefined,
                    identifier               : undefined,
                    pagePath                 : undefined,
                    defaultLocale            : undefined,
                    gaiaApi                  : undefined,
                    drupalMultisiteIdentifier: undefined,
                    baseHost                 : undefined,
                    logo : undefined,
                    hasFlag : undefined,
                    config:     undefined,
                    name:       undefined,
                }

function state(){ return initState }



function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useSiteStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}

async function initialize(nuxtApp){
    const { gaiaApi, drupalMultisiteIdentifier, baseHost }   = useRuntimeConfig().public;
    const { hostname } = useRequestURL();

    this.set('baseHost',baseHost);
    this.set('gaiaApi',gaiaApi);
    this.set('drupalMultisiteIdentifier',drupalMultisiteIdentifier);
    this.set('locale',nuxtApp.$i18n.locale);
    this.set('identifier',getBiolandSiteIdentifier(hostname) || 'seed');
    this.set('defaultLocale',await this.getSiteDefaultLocale());

    const config = await this.getSiteConfig();
    this.set('config',await this.getSiteConfig());
    this.set('logo',getLogoUri(config));
    this.set('name',await this.getDefinedName());
}   

function watchLocaleChange(nuxtApp, functions = []){
    const locale  =  nuxtApp.$i18n.locale

    watch(locale, async (newLocale) => {
        this.set('locale',newLocale);
        await this.initialize(nuxtApp);

        for (const aFunction of functions)
            await aFunction();
        
    }, { immediate: true });
}

async function getSiteDefaultLocale(){
    const { identifier, gaiaApi, drupalMultisiteIdentifier } = this;


    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/${identifier}/default-locale`

    const { data, error } = await useFetch(uri)

    return data.value
}
//https://api.cbddev.xyz/api/v2023/drupal/multisite/bl2/configs/seed

async function getSiteConfig(){
    const { identifier, gaiaApi, drupalMultisiteIdentifier } = this;


    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/configs/${identifier}`

    return $fetch(uri)
}

function getLogoUri(config){
    const hasCountry = config.country || (config?.countries? config?.countries[0] : undefined)

    if(config.logo)  return config.logo;

    if(hasCountry) return `https://seed.chm-cbd.net/sites/default/files/images/flags/flag-${hasCountry}.png`

    return 'https://seed.chm-cbd.net/sites/default/files/images/country/flag/xx.png'
}

async function getDefinedName () {
    const { locale, identifier,   baseHost, defaultLocale } = this;
    const pathPreFix = locale === defaultLocale?.locale? '' : `/${locale}`;
    const pathLocale = pathPreFix === '/zh'? '/zh-hans' : pathPreFix;
    const query = {jsonapi_include: 1};
    const uri = `https://${encodeURIComponent(identifier)}${baseHost}${pathLocale}/jsonapi/site/site?api-key=636afe3fa6d502d3d7b01996b50add18`

    const resp = await $fetch(uri,{query})
    const name = resp?.data?.name

    return name === '_'? '' : name;
}

// TODO
// get country name from server translated