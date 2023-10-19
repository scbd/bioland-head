import { defineStore } from 'pinia'


const actions = { set, loadAllMenus }

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

function loadAllMenus(){
    const allPromises = [];

    allPromises[0] = useFooterMenus().then((menus) => this.set('footer', menus) );
    allPromises[1] = useMainMenus().then((menus) => this.set('main', menus));
    allPromises[2] = useFooterCreditsMenus().then((menus) => this.set('footerCredits', menus));
    allPromises[3] = useLanguageMenus().then((menus) => this.set('languages', menus));

    return Promise.all(allPromises);
}