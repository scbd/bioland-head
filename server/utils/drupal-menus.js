import clone from 'lodash.clonedeep';

export async function useMenus(query){
    const menuNames = ['main', 'footer', 'footer-credits'];
    const menuPromises = [];
    const menus = {};

    for (const menuName of menuNames) {
        const menuPromise = getMenuData(menuName,query )
                            .then((menusData) => menus[menuName] = menusData);

        menuPromises.push(menuPromise);

        
    }
    menuPromises.push(getInstalledLanguages(query));
    const [main, footer, footerCredits, languages ] = await Promise.all(menuPromises);
    const [ cleanMenus ] = await Promise.all( [addMissingData(menus, query )])


    await getThumbNails(cleanMenus, query)
    return { ...cleanMenus, languages };
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
        if(aMenu.children) getInternalUrlsRecursive(aMenu.children, { internalUrlsArr:internalUrls, parent:aMenu })
        // if(aMenu.title==='Publications')

        if(!parent?.class?.includes('bl2-show-thumbs')) continue;
        if(aMenu?.path?.includes('entity')) internalUrls.push(aMenu)
    }
    return internalUrls
}
const findFromRawMenus = (aMenu )=>({ link, title, alias  } = {})=>{

    if(aMenu.href === link.uri && aMenu.title === title) return true
    if(aMenu.href === link.alias && aMenu.title === title) return true

    return false
}

async function addMissingData(menus, { identifier, pathPreFix, localizedHost }){
    const rawMenus =  await getMenusFromApiPager ({ identifier, pathPreFix, localizedHost });
    
    for (const menuName in menus) {
        const rawMenuSet = rawMenus.filter((l) => l.menu_name === menuName)

        addMissingDataRecursive(menus[menuName], { identifier, pathPreFix, localizedHost, rawMenus:rawMenuSet, menuName  })
    }

    return menus
}

function addMissingDataRecursive(menus, { identifier, pathPreFix, rawMenus, menuName, localizedHost  }){

        for (const aMenu of menus) {
            if(aMenu.children) aMenu.children=addMissingDataRecursive(aMenu.children, { identifier, pathPreFix, rawMenus, menuName, localizedHost  })

            const rawMenu = rawMenus.find(findFromRawMenus(aMenu))
            // if(rawMenu?.title==='Biodiversity Facts')

            if(!rawMenu) continue;
            if(rawMenu?.description) aMenu.description = rawMenu.description;
            if(rawMenu?.link?.uri) aMenu.path = rawMenu.link.uri;
            if(rawMenu?.id) aMenu.id = rawMenu.id;
            if(rawMenu?.drupal_internal__id) aMenu.drupalInternalId = rawMenu.drupal_internal__id;
        }

    return menus
}

async function getPathAliasFromApiPager ({ identifier, pathPreFix, localizedHost }, next){
    try {


        const $http = await useDrupalLogin(identifier);

        const uri = next || `${localizedHost}/jsonapi/path_alias/path_alias`

        const { body }  = await $http.get(uri).withCredentials().accept('json');

        const { links, data } = body

        if(nextUri(links)) return [ ...data, ...await getPathAliasFromApiPager({ identifier, pathPreFix, localizedHost }, nextUri(links)) ]

        return data
    }
    catch(e){
       // console.error('Menus.getPathAliasFromApiPager - recursive', e)
    }
}

export async function getMenusFromApiPager ({ identifier, pathPreFix, pathAlias, localizedHost }, next){
    try {
        const paths = pathAlias? pathAlias : await getPathAliasFromApiPager({ identifier, pathPreFix, localizedHost })

        const $http = await useDrupalLogin(identifier)

        const uri = next || `${localizedHost}/jsonapi/menu_link_content/menu_link_content`

        const { body }  = await $http.get(uri).withCredentials().accept('json')

        const { links, data } = body

        for (const aMenu of data) {
            const path = paths.find(({ path:p }) => aMenu.link.uri.includes(p.substring(1)) )

            if(path) aMenu.link.alias = path.alias
        }

        if(nextUri(links)) return [ ...data, ...await getMenusFromApiPager({ identifier, pathPreFix, pathAlias:paths, localizedHost }, nextUri(links)) ]


        return data
    }
    catch(e){
       // console.error('Menus.getMenusFromApiPager - recursive', e)
    }
}

async function getMenuData(menuName, ctx){
    const { host, pathPreFix, localizedHost } = ctx;

    const uri = `${localizedHost}/system/menu/${encodeURIComponent(menuName)}/linkset`;

    const data = await $fetch(uri, { mode: 'cors' });

    return data?.linkset? formatMenus(data.linkset[0].item) : [];
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
// async function addDescriptions(menus, { identifier, pathPreFix, menuName }){
//     const rawMenus = (await getMenusFromApiPager ({ identifier, pathPreFix })).filter((l) => l.menu_name === menuName)
//                         .map(({ description, title, link })=>({ description, title, link: link.uri.replace('internal:', '') }))

//     // for (const aMenu of menus) {

//     // }

// }

function splitClasses(menus){

    for (const aMenu of menus){
        if(Array.isArray(aMenu.class)) aMenu.class = aMenu.class[0].split(' ');
        if(Array.isArray(aMenu['machine-name']))    aMenu.machineName = aMenu['machine-name'][0];
        if(Array.isArray(aMenu.target))          aMenu.target = aMenu.target[0];
        delete(aMenu['machine-name']) ;
        
    }
    return menus;
}

function embedChildren(menus, menusClone){
    let index = -1;
    for (const aMenu of menus) {
        index++
        const children = [];
        if(Array.isArray(aMenu.crumbs))
            aMenu.crumbs.push({ title: aMenu.title, href: aMenu.href, index })
        else aMenu.crumbs = [{ title: aMenu.title, href: aMenu.href, index }]
        
        for (const aMenuClone of menusClone) {

            if((aMenuClone.hierarchy.length - aMenu.hierarchy.length) != 1) continue;

            const aMenuCloneHierarchy = aMenuClone.hierarchy.join('.');
            const aMenuHierarchy      = aMenu.hierarchy.join('.');

            if(!aMenuCloneHierarchy.startsWith(aMenuHierarchy)) continue;

            if(!Array.isArray(aMenuClone.crumbs))
                aMenuClone.crumbs = clone(aMenu?.crumbs);

                // if(!aMenuClone.crumbs.find(({ title, href }) => title === aMenuClone.title && href===aMenu.href))
                    
            
            // Array.from(new Set([...( aMenu?.crumbs || []),{ title: aMenu.title, href: aMenu.href, index }]))
            //aMenuClone.crumbs.push({ title: aMenuClone.title, href: aMenuClone.href })
            
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

function nextUri ({ next } = {}){
    if(!next) return
    return next.href
}