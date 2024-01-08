import { defineStore } from 'pinia'


const actions = { set, loadAllMenus, isInMainMenu, isInFooterMenu, isInFooterCreditsMenu }

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
    // mediaTypes: {},
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
    // this.set('mediaTypes', menus?.mediaTypes);
    this.set('forums', menus?.forums);

}

function isInMainMenu(href){
    for(let i = 0; i < this.main.length; i++)
        if(isInMenu(this.main[i], href)) return isInMenu(this.main[i], href)

    return false;
}

function isInFooterMenu(href){

    return isInMenu(this.footer, href)
}

function isInFooterCreditsMenu(href){

    return isInMenu(this.footerCredits, href)
}

function isInMenu(menu, href){

    if(menu.href === href && menu.href && href) return menu;

    if(menu?.children?.length)
        for(let i = 0; i < menu.children.length; i++)
            if(isInMenu(menu.children[i], href)) return isInMenu(menu.children[i], href);

    return false;
}