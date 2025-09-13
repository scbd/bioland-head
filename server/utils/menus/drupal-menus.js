import clone     from 'lodash.clonedeep'   ;
import intersect from 'lodash.intersection';

const mainChildren = [ 'convention-protocols','biodiversity-facts','cooperation', 'implementation','news-updates', 'resources'  ];
const menuNames    = [ 'main', 'footer', 'footer-credits' ];

export async function getDrupalMenus(ctx){

    const newStructure = await hasNewMenuStructure(ctx);
    const allMenuNames = newStructure? [ ...menuNames, ...mainChildren ] : menuNames;
    const menuPromises = [];
    const menus = {};

    for (const menuName of allMenuNames) {
        const menuPromise = getMenuData(menuName,ctx )
                            .then((menusData) => menus[menuName] = menusData);

        menuPromises.push(menuPromise);
    }

    await Promise.all(menuPromises);

    const cleanMenus  = await addMissingData(menus, ctx )

    if(newStructure)
        buildMainChildren(cleanMenus);

    await getThumbNails(cleanMenus, ctx);

    return { ...cleanMenus};
}

async function hasNewMenuStructure(ctx){
    try{
        const { host } = ctx;
        const   uri    = `${host}/system/menu/${encodeURIComponent('cooperation')}/linkset`;

        const data = await $fetch(uri, { mode: 'cors', ignoreResponseError: true }).catch((e)=>  false);

        return data?.linkset && data?.linkset?.length ? true : false;
    }
    catch(e){
        return false;
    };
    
}

function buildMainChildren(allMenus){
    for (const aMenu of allMenus.main) {
        if(!mainMenuHasChild(aMenu)) continue;

        aMenu.children = allMenus[mainMenuHasChild(aMenu)]
        for (const aChild of aMenu.children) {
            aChild.hierarchy?.unshift(aMenu.hierarchy[0])
            aChild.crumbs?.unshift(aMenu.crumbs[0])
        }
        delete allMenus[mainMenuHasChild(aMenu)]
    }

    return allMenus;
}

function mainMenuHasChild(aMainMenu){
    const hasChild = intersect(aMainMenu.class||[], mainChildren);

    return  hasChild.length? hasChild[0] : false;
}

async function getThumbNails(menus, ctx){
    const internalUrls  = getInternalUrlsRecursive(menus.main);
    const pagesPromises = [];

    for (const aMenu of internalUrls){
        pagesPromises.push(getPageThumb({ ...ctx, path: aMenu.href }).then((thumb) => aMenu.thumb = thumb));

        pagesPromises.push(getPageDates({ ...ctx, path: aMenu.href }).then(({changed, created, startDate}) => { 
            aMenu.changed = changed;
            aMenu.created = created;
            aMenu.startDate = startDate;
        }));
    }
    return Promise.all(pagesPromises)
}

function getInternalUrlsRecursive(menus,{internalUrlsArr, parent}={}){
    const internalUrls = internalUrlsArr? internalUrlsArr : [];

    for (const aMenu of menus) {
        if(!parent?.class?.includes('bl2-show-thumbs') || !parent?.class?.includes('mm-show-thumbs') ) continue;

        if(aMenu.children) getInternalUrlsRecursive(aMenu.children, { internalUrlsArr:internalUrls, parent:aMenu })

        internalUrls.push(aMenu)
    }
    return internalUrls
}

const findFromRawMenus = (aMenu )=>({ link, title, alias, menu_name } = {})=>{

    const hrefEqual = aMenu.href? aMenu.href === link.uri : link.uri === 'route:<nolink>';

    if( hrefEqual && aMenu.title === title && menu_name === aMenu.machineName) return true
    if(aMenu.title === title  && menu_name  === aMenu.machineName) return true

    return false
}

async function addMissingData(menus, { siteCode, identifier, pathPreFix, localizedHost }){
    const rawMenus =  (await getMenusFromApiPager ({ siteCode,identifier, pathPreFix, localizedHost }) || []);

    for (const menuName in menus) {
        const rawMenuSet = rawMenus.filter((l) => l.menu_name === menuName);

        addMissingDataRecursive(menus[menuName], { siteCode,identifier, pathPreFix, localizedHost, rawMenus:rawMenuSet, menuName  })
    }

    return menus
}

function addMissingDataRecursive(menus, { siteCode,identifier, pathPreFix, rawMenus, menuName, localizedHost  }){

        for (const index in menus) {
            if(!menus[index]) continue;
            if(menus[index].children) menus[index].children=addMissingDataRecursive(menus[index].children, { siteCode,identifier, pathPreFix, rawMenus, menuName, localizedHost  })

            const rawMenu = rawMenus.find(findFromRawMenus(menus[index]))
            if(rawMenu)

            if(!rawMenu) continue;
            if(rawMenu?.description) menus[index].description = rawMenu.description;
            if(rawMenu?.link?.uri) menus[index].path = rawMenu.link.uri;
            if(rawMenu?.id) menus[index].id = rawMenu.id;
            if(rawMenu?.drupal_internal__id) menus[index].drupalInternalId = rawMenu.drupal_internal__id;
        }

    return menus
}


async function getMenusFromApiPager ({ siteCode,identifier, pathPreFix, pathAlias, localizedHost }, next){
    try {
        let filterQueryString = '?jsonapi_include=1';
        filterQueryString += `&filter[tag-filter-desc][condition][path]=description`
        filterQueryString += `&filter[tag-filter-desc][condition][operator]=IS NOT NULL`

        const $http = await useDrupalLogin(siteCode)

        const uri = next || `${localizedHost}/jsonapi/menu_link_content/menu_link_content${filterQueryString}`

        const { body }  = await $http.get(uri).withCredentials().accept('json')

        const { links, data } = body


        if(nextUri(links)) return [ ...data, ...await getMenusFromApiPager({ siteCode,identifier, pathPreFix, pathAlias:paths, localizedHost }, nextUri(links)) ]


        return data
    }
    catch(e){
        consola.error('Menus.getMenusFromApiPager - recursive', e)
    }
}

async function getMenuData(menuName, ctx){
    const { host, pathPreFix, localizedHost } = ctx;

    const uri = `${localizedHost}/system/menu/${encodeURIComponent(menuName)}/linkset`;


    const data = await $fetch(uri, { mode: 'cors' });

    return data?.linkset && data?.linkset?.length ? formatMenus(data.linkset[0].item) : [];
}

function formatMenus(menuData){
    const menusClone = clone(splitClasses(menuData));
    const menus = [];

    for (const aMenu of menusClone) {
        
        if(aMenu.hierarchy.length>1) continue;

        menus.push(aMenu)
    }
    
    menus.sort(sortMenus);

    embedChildren(menus, menusClone)


    return menus;
}


function splitClasses(menus){

    for (const aMenu of menus){
        if(Array.isArray(aMenu.class)) aMenu.class = aMenu.class[0].split(' ');
        if(Array.isArray(aMenu['machine-name']))    aMenu.machineName = aMenu['machine-name'][0];
        if(Array.isArray(aMenu.target))          aMenu.target = aMenu.target[0];
        delete(aMenu['machine-name']) ;
        addContentTypeId(aMenu);
    }
    return menus;
}

const typeMapIds = { news:2, event:3, 'learning-resource':4, project:5, 'basic-page':6, 'government-ministry-or-institute':8, ecosystem:9, 'protected-area':10, 'biodiversity-data':11, document:12, 'related-website':13, other:15, 'image-or-video':16 };

function addContentTypeId(aMenu){
    const contentType = aMenu?.class?.find((c)=> c.startsWith('bl2-content-type-') || c.startsWith('mm-content-type-'))
    if(!contentType) return aMenu;

    const contentTypeName = contentType.replace('bl2-content-type-', '').replace('mm-content-type-', '');

    aMenu.contentTypeId = typeMapIds[contentTypeName];

    return aMenu;
}

function embedChildren(menus, menusClone){
    let index = -1;
    for (const aMenu of menus) {
        index++
        const children = [];

        if(Array.isArray(aMenu.crumbs))
            aMenu.crumbs.push({ title: aMenu.title, href: aMenu.href, index, contentTypeId: aMenu.contentTypeId})
        else aMenu.crumbs = [{ title: aMenu.title, href: aMenu.href, index, contentTypeId: aMenu.contentTypeId}]
        
        for (const aMenuClone of menusClone) {

            if((aMenuClone.hierarchy.length - aMenu.hierarchy.length) != 1) continue;

            const aMenuCloneHierarchy = aMenuClone.hierarchy.join('.');
            const aMenuHierarchy      = aMenu.hierarchy.join('.');

            if(!aMenuCloneHierarchy.startsWith(aMenuHierarchy)) continue;

            if(!Array.isArray(aMenuClone.crumbs))
                aMenuClone.crumbs = clone(aMenu?.crumbs);

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