import clone from 'lodash.clonedeep';
import {  useSiteStore } from "~/stores/site";

export const useFooterMenus = () => {
    return getMenuData('footer');
}
export const useFooterCreditsMenus = () => {
    return getMenuData('footer-credits');
}
export const useMainMenus = () => {
    return getMenuData('main');
}

async function getMenuData(menuName: string){
    const { locale, identifier,   baseHost, defaultLocale } = useSiteStore();

    const pathLocale = locale === defaultLocale?.locale? '' : `/${locale}`;

    const uri = `https://${identifier}${baseHost}${pathLocale}/system/menu/${encodeURIComponent(menuName)}/linkset`;

    const { data, error } = await useFetch(uri, { mode: 'cors' });

    return data.value?.linkset? formatMenus(data.value.linkset[0].item) : [];
}


function formatMenus(menuData: Array){
    const menusClone = clone(menuData);
    const menus = [];

    for (const aMenu of menusClone) {
        
        if(aMenu.hierarchy.length>1) continue;

        menus.push(aMenu)
    }
    
    menus.sort(sortMenus);

    embedChildren(menus, menusClone)

    return menus;
}

function embedChildren(menus: Array, menusClone: Array){

    for (const aMenu of menus) {
        const children = [];
        for (const aMenuClone of menusClone) {
            if((aMenuClone.hierarchy.length - aMenu.hierarchy.length) != 1) continue;

            const index = aMenu.hierarchy.length - 1;

            if(aMenuClone.hierarchy[index] !== aMenu.hierarchy[index]) continue;

            children.push(aMenuClone);
        }
        if(!children.length) continue;

        children.sort(sortMenus);

        aMenu.children = children;
        
        embedChildren(aMenu.children, menusClone);
    }
}

function sortMenus(x,y){
    const index = x.hierarchy.length - 1;

    if (x.hierarchy[index] > y.hierarchy[index])
        return 1;
    if (x.hierarchy[index] < y.hierarchy[index])
        return -1;

    return 0;
}
