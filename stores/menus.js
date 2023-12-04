import { defineStore } from 'pinia'


const actions = { set, loadAllMenus }

export const useMenusStore = defineStore('menus', { state, actions,  persist: true, })

const initState = { 
    footer: [],
    main: [],
    footerCredits: [],
    languages: [],
    nrSix:[],
    nr:[],
    nbsap:{},
    bch:[],
    absch:[],
    nfps:[],
    // counts:[],
    contentTypes:{},
    mediaTypes: {},
    forums: [],
}

function state(){ return initState }

function set(name, value){

    if(!Object.keys(initState).includes(name)) throw new Error(`useMenusStore.set -> State ${name} is not defined`);

    this.$patch({ [name]: unref(value) } );

    return this;
}

function loadAllMenus(menus = {}){

    this.set('footer', menus?.footer);
    this.set('main', menus?.main);
    if(menus)
    this.set('footerCredits', menus['footer-credits']);
    this.set('languages', menus?.languages);
    this.set('absch', menus?.absch);
    this.set('bch', menus?.bch);
    this.set('nr', menus?.nr);
    this.set('nrSix', menus?.nrSix);
    this.set('nbsap', menus?.nbsap);
    this.set('nfps', menus?.nfps);
    // this.set('counts', menus?.counts);
    this.set('contentTypes', menus?.contentTypes);
    this.set('mediaTypes', menus?.mediaTypes);
    this.set('forums', menus?.forums);

}