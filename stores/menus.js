import { noCase } from 'change-case';
const typeMapIds  = { news:2, event:3, 'learning-resource':4, project:5, 'basic-page':6, 'government-ministry-or-institute':8, ecosystem:9, 'protected-area':10, 'biodiversity-data':11, document:12, 'related-website':13, other:15, 'image-or-video':16 };

export const useMenusStore = defineStore('menus', { 
    state: () => ({ footer: [], main: [], footerCredits: [], languages: [], nrSix:[], nr:[], nbsap:{}, bch:[], absch:[], nfps:[], contentTypes:{}, forums: [], systemPages:[]}),
    actions:{
        set(name, value){

            if(!Object.keys(this.$state).includes(name)) throw new Error(`useMenusStore.set -> State ${name} is not defined`);
        
            this.$patch({ [name]: unref(value) } );
        
            return this;
        },
        loadAllMenus(menus = {}){

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
            this.set('contentTypes', menus?.contentTypes);
            this.set('forums', menus?.forums);
            this.set('systemPages', menus?.systemPages);
        },
        isInMenu(menu, href){
            const hrefMatch = menu?.href === href && menu?.href && href

            if(hrefMatch) return menu;
        
            if(menu?.children?.length)
                for(let i = 0; i < menu.children.length; i++){
                    if(this.isInMenu(menu.children[i], href)) return this.isInMenu(menu.children[i], href);

                    if( menu.children[i].children?.length)
                        for(let j = 0; j < menu.children[i].children.length; j++)
                            if(this.isInMenu(menu.children[i].children[j], href)) return this.isInMenu(menu.children[i].children[j], href); 
                }      
            return false;
        },
        isInMenuId(menu, href){
            const hrefMatch = menu?.href === href && menu?.href && href

            if(hrefMatch) return menu;
        
            if(menu?.children?.length)
                for(let i = 0; i < menu.children.length; i++)
                    if(this.isInMenu(menu.children[i], href)) return this.isInMenu(menu.children[i], href);
        
            return false;
        },
        isInMainMenu(href){
            if(!this.main?.length) return false;

            for(let i = 0; i < this.main.length; i++)
                if(this.isInMenu(this.main[i], href)) return this.isInMenu(this.main[i], href)
        
            return false;
        },
        isInDynamicContentMenu(did, contentTypeId, locale ){
            const contentType = this.getContentTypeById(contentTypeId, unref(locale));

            if(!contentType?.data?.length) return false
            for (const pageRef of contentType.data) {
                if(pageRef.nid=== did) return pageRef
            }
            return false
        },
        isInFooterMenu(href){
            return this.isInMenu(this.footer, href)
        },
        isInFooterCreditsMenu(href){
            return this.isInMenu(this.footerCredits, href)
        },
        getContentTypeById(id, locale){
            return  unref(locale)? Object.values(this.contentTypes).find((ct)=> ct.drupalInternalId === id && ct.langcode === unref(locale)) : Object.values(this.contentTypes).find((ct)=> ct.drupalInternalId === id) ;
        },
        getContentTypeByName(name, locale){
            
            return Object.values(this.contentTypes).find((ct)=> { 
                if(locale) return (ct.name.toLowerCase() === noCase(name)  || ct.plural.toLowerCase() === noCase(name)) && ct.langcode === locale;
                return ct.name.toLowerCase() === noCase(name) || ct.plural.toLowerCase() === noCase(name)});
        },
        isContentTypeId(id){
            return (Object.values(this.contentTypes).map((ct)=> ct.drupalInternalId)).includes(Number(id));
        },
        getContentType(name,locale){
            const id          = typeMapIds[name];
            const contentType =  this.getContentTypeById(id, locale);
        
            return contentType;
        },
        getContentTypeData(name,country, locale){
            const id          = typeMapIds[name];
            const contentType =  this.getContentTypeById(id, locale);
        
            return country? contentType?.dataMap[country] : contentType.data;
        },
        isInMainMenuByContentTypeId(id){
            if(!id || !this?.main?.length) return false;
    
            for(let i = 0; i < this.main.length; i++)
                if(this.isInMenuByContentTypeId(this.main[i], id)) return this.isInMenuByContentTypeId(this.main[i], id)
        
            return false;
        },
        isInContentTypesById(id){
            if(!id) return false;
            if(!this?.main?.length) return false;

            for(let i = 0; i < this.main.length; i++)
                if(this.main[i].children?.length)
                    for(let j = 0; j < this.main[i].children.length; j++)
                        if(this.main[i].children[j].length)
                            if(this.isInMenuByContentTypeId(this.main[i].children[j], id)) 
                                return this.isInMenuByContentTypeId(this.main[i].children[j], id)
            
            return false;
        },
        isInMenuByContentTypeId(menu, id){

            if(menu.contentTypeId === id && menu.contentTypeId && id) return menu;
        
            if(menu?.children?.length)
                for(let i = 0; i < menu.children.length; i++)
                    if(this.isInMenuByContentTypeId(menu.children[i], id)) 
                        return this.isInMenuByContentTypeId(menu.children[i], id);
        
            return false;
        },
        getSystemPageById(id){
            return this.systemPages.find((sp)=> sp.drupalInternalTid === id);
        },
        getSystemPageByAlias(alias, locale){
            return this.systemPages.find((sp)=> sp?.aliases? sp?.aliases[locale] === alias : '');
        },
        getSystemPagePath({alias,id, locale}){
            const term = alias? this.getSystemPageByAlias(alias, locale) : this.getSystemPageById(id);

            if(!term || !term?.aliases?.length) return id? `/taxonomy/term/${id}`:`/taxonomy/term/${systemPageTidConstants.SEARCH}`;

            return term.aliases[locale]
        },
    },
    getters:{
        isLoaded: state => !!state?.footer?.length
    }
});