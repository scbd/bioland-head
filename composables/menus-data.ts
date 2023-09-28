import clone from 'lodash.clonedeep';

export const useFooterMenus = async () => {
    return getMenuData('footer');
}

export const useMainMenus = async () => {
    return getMenuData('main');
}

async function getMenuData(menuName: string){
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost }   = useRuntimeConfig().public;

    const uri = `https://${siteIdentifier.value}${baseHost}/system/menu/${encodeURIComponent(menuName)}/linkset`

    const { data, error } = await useFetch(uri, {mode: 'cors'})

    

    return formatMenus(data.value.linkset[0].item);
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
