import clone from 'lodash.clonedeep';

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp   = useNuxtApp()
  const context   = useCookie('context');
  const siteStore = useSiteStore(nuxtApp.$pinia);
  const pStore    = usePageStore(nuxtApp.$pinia);
  const route       = useRoute();
  const menuStore   = useMenusStore(nuxtApp.$pinia)
  const isNewLocale = isLocaleChange(to, from) && !!pStore.drupalInternalNid;

  const localePath  = siteStore.locale === siteStore.defaultLocale? '' : `/${siteStore.locale}`;
  const path        = isNewLocale? `${localePath}/node/${pStore.drupalInternalNid}` : to.path;

  if(!context.value) context.value = {};
    context.value.path = path;

  const [ pData, fetch ]= await Promise.all([getPage(path), getMenus()])

  const { data:menuData } = fetch || { data: undefined};
  
  if(!pData?.value) return

  pStore.initialize(pData.value)

  // const { data:menuData } = await useFetch(`/api/menus`, { params: clone({...siteStore.params, path:route.path})});

  if(menuData?.value)
    menuStore.loadAllMenus(menuData.value);

  async function getPage(passedPath){ 
    const path = passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath;
    const { multiSiteCode } = useRuntimeConfig().public;
    const { identifier,  locale } = siteStore;

    const key = `${multiSiteCode}-${identifier}-${locale}`;

    const { data, error } = await useFetch(`/api/page/${key}/${encodeURIComponent(path)}`, {  method: 'GET', params: clone({ ...siteStore.params, path }) })//.then(({ data }) => data);
  
    if(error.value) throw  createError({ statusCode: 404, statusMessage: `Page not found for path: ${path}` }) 

    return data
  }

  async function getMenus(){
    if(menuStore.isLoaded) return undefined;

    return useFetch(`/api/menus`, { params: clone({...siteStore.params, path:route.path})})
  }

})

function isLocaleChange({ name: to }, { name: from }){

  const toLocale   = getLocaleFromRouteName(to);
  const fromLocale = getLocaleFromRouteName(from);

  return toLocale !== fromLocale;
}

function getLocaleFromRouteName(name){
  if(!name)return '';
  const indexToSlice = name.lastIndexOf('_');
  return name.slice(indexToSlice + 1);
}

