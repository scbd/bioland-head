import { defineStore } from 'pinia'
import { getBiolandSiteIdentifier } from "~/util";

const actions = { set, initialize, getSiteDefaultLocale, watchLocaleChange }

export const useSiteStore = defineStore('site', { state, actions })

const initState = { 
                    locale                   : undefined,
                    identifier               : undefined,
                    pagePath                 : undefined,
                    defaultLocale            : undefined,
                    gaiaApi                  : undefined,
                    drupalMultisiteIdentifier: undefined,
                    baseHost                 : undefined,
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