import clone from 'lodash.clonedeep';

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp   = useNuxtApp()
  const context   = useCookie('context');
  const siteStore = useSiteStore(nuxtApp.$pinia);
  const pStore    = usePageStore(nuxtApp.$pinia);
  // const route       = useRoute();
  const menuStore   = useMenusStore(nuxtApp.$pinia)
  const isNewLocale = isLocaleChange(to, from) && !!pStore.drupalInternalNid;

  const localePath  = siteStore.locale === siteStore.defaultLocale? '' : `/${siteStore.locale}`;
  const path        = to.path//isNewLocale? `${localePath}/node/${pStore.drupalInternalNid}` : to.path;
consola.warn('to.path', to.path)
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
    const path = ref(passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath);
    const { multiSiteCode } = useRuntimeConfig().public;
    const { identifier,  locale } = siteStore;

    const key = ref(`${multiSiteCode}-${identifier}-${locale}-${encodeURIComponent(path.value)}`);
consola.warn(path.value)
    const { data, error } = await useFetch(`/api/page/${key.value}/${encodeURIComponent(path.value)}`, {  method: 'GET', params: clone({ ...siteStore.params, path:path.value }) })//.then(({ data }) => data);
  
    if(error.value) throw  createError({ statusCode: 404, statusMessage: `Page not found for path: ${path}` }) 
// consola.error('getPage', data.value)
    consola.warn(path.value)
    return data
  }

  async function getMenus(){
    if(menuStore.isLoaded) return undefined;

    return useFetch(`/api/menus`, { params: clone({...siteStore.params, path:to.path})})
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

