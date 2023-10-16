import { defineStore } from 'pinia'


const actions = { set }

export const useSiteStore = defineStore('site', { state, actions })

const initState = { 
    locale: undefined,
    identifier: undefined,
    pagePath: undefined,
    defaultLocale: undefined,
    gaiaApi: undefined,
    drupalMultisiteIdentifier: undefined,
    baseHost: undefined,
}

function state(){ return initState }



function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useSiteStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}

