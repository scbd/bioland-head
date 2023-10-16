import { defineStore } from 'pinia'


const actions = { set }

export const useMenusStore = defineStore('menus', { state, actions })

const initState = { 
    footer: [],
    main: [],
    footerCredits: [],
    languages: []
}

function state(){ return initState }

function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useMenusStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}
