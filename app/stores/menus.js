import { noCase, kebabCase } from "change-case";
import { contentTypeTidConstants } from "#shared/utils/constants";

const typeMapIds = Object.fromEntries(Object.entries(contentTypeTidConstants).map(([key, value]) => [kebabCase(key), value]));

export const useMenusStore = defineStore('menus', { 
    state: () => ({ 
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
        contentTypes:{}, 
        forums: [], 
        systemPages:[], 
        nt7:[]
    }),
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
            this.set('nt7', menus?.nt7);
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
            const localeValue = unref(locale);
            if (localeValue) {
                // First try to find by locale
                const localized = Object.values(this.contentTypes).find((ct)=> ct.drupalInternalId === id && ct.langcode === localeValue);
                if (localized) return localized;
                // Fall back to English
                const english = Object.values(this.contentTypes).find((ct)=> ct.drupalInternalId === id && ct.langcode === 'en');
                if (english) return english;
            }
            // Return first match if no locale specified or no match found
            return Object.values(this.contentTypes).find((ct)=> ct.drupalInternalId === id);
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
        /**
         * Find a menu entry in the main menu that matches the given taxonomy term ID (system page).
         * Checks both `/taxonomy/term/{tid}` paths and any system page aliases.
         * Also checks for component classes that map to system pages (e.g., bl2-component-focal-points).
         * 
         * @param {number} tid - The drupalInternalTid of the system page
         * @param {string} locale - The current locale for alias lookup
         * @returns {object|false} The matching menu entry with crumbs/hierarchy, or false
         */
        isInMainMenuBySystemPageTid(tid, locale){
            if(!tid || !this?.main?.length) return false;
    
            // Get system page to check for aliases
            const systemPage = this.getSystemPageById(tid);
            const taxonomyPath = `/taxonomy/term/${tid}`;
            const aliasPath = systemPage?.aliases?.[locale];
            // Also check with locale prefix since menu hrefs often include it
            const localizedAliasPath = aliasPath ? `/${locale}${aliasPath}` : null;
            
            // Map of known system page TIDs to their component class names
            const systemPageComponentMap = {
                30: 'focal-points', // NATIONAL_CONTACT_POINTS
                24: 'forums',       // FORUMS
                21: 'search',       // SEARCH
            };
            const componentClass = systemPageComponentMap[tid];
    
            for(let i = 0; i < this.main.length; i++){
                // First try direct href match
                const found = this.isInMenuByHref(this.main[i], taxonomyPath, aliasPath, localizedAliasPath);
                if(found) return found;
                
                // If not found by href and we have a component class, try matching by class
                if(componentClass){
                    const foundByClass = this.isInMenuByComponentClass(this.main[i], componentClass);
                    if(foundByClass) return foundByClass;
                }
            }
        
            return false;
        },
        /**
         * Recursively search a menu tree for an entry matching the given href(s).
         * 
         * @param {object} menu - The menu item to search
         * @param {string} primaryHref - The primary href to match (e.g., /taxonomy/term/21)
         * @param {string} [aliasHref] - An optional alias href to also match
         * @param {string} [localizedAliasHref] - An optional localized alias href (e.g., /en/national-contact-points)
         * @returns {object|false} The matching menu entry, or false
         */
        isInMenuByHref(menu, primaryHref, aliasHref, localizedAliasHref){
            const hrefMatch = (menu.href === primaryHref) || 
                              (aliasHref && menu.href === aliasHref) ||
                              (localizedAliasHref && menu.href === localizedAliasHref);
            
            if(hrefMatch && menu.href) return menu;
        
            if(menu?.children?.length)
                for(let i = 0; i < menu.children.length; i++){
                    const found = this.isInMenuByHref(menu.children[i], primaryHref, aliasHref, localizedAliasHref);
                    if(found) return found;
                }
        
            return false;
        },
        /**
         * Recursively search a menu tree for an entry with a matching component class.
         * Component classes are like bl2-component-focal-points, mm-component-search, etc.
         * 
         * @param {object} menu - The menu item to search
         * @param {string} componentName - The component name to match (e.g., 'focal-points')
         * @returns {object|false} The matching menu entry, or false
         */
        isInMenuByComponentClass(menu, componentName){
            const classPatterns = [
                `bl2-component-${componentName}`,
                `mm-component-${componentName}`,
            ];
            
            const hasClass = menu?.class?.some(c => classPatterns.includes(c));
            if(hasClass) return menu;
        
            if(menu?.children?.length)
                for(let i = 0; i < menu.children.length; i++){
                    const found = this.isInMenuByComponentClass(menu.children[i], componentName);
                    if(found) return found;
                }
        
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