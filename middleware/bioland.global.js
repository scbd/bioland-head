import clone from 'lodash.clonedeep';

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp   = useNuxtApp()
  const context   = useCookie('context');
  const siteStore = useSiteStore(nuxtApp.$pinia);
  const pStore    = usePageStore(nuxtApp.$pinia);
  const menuStore   = useMenusStore(nuxtApp.$pinia)
  const meStore  = useMeStore(nuxtApp.$pinia)
  const isNewLocale = isLocaleChange(to, from) && !!pStore.drupalInternalNid;

  const localePath  = siteStore.locale === siteStore.defaultLocale? '' : `/${siteStore.locale}`;
  const path        = to.path//isNewLocale? `${localePath}/node/${pStore.drupalInternalNid}` : to.path;

  await getMe();
  if(!context.value) context.value = {};
    context.value.path = path;

  const [ pData, fetch ]= await Promise.all([getPage(path), getMenus()])

  const { data:menuData } = fetch || { data: undefined};
  

  if(!pData?.value) return

  pStore.initialize(pData.value)


  if(menuData?.value)
    menuStore.loadAllMenus(menuData.value);

  async function getPage(passedPath){ 
    const path = ref(passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath);
    const { multiSiteCode } = useRuntimeConfig().public;
    const { identifier,  locale } = siteStore;

    const key = ref(`${multiSiteCode}-${identifier}-${locale}-${encodeURIComponent(path.value)}`);

    const { data, error } = await useFetch(`/api/page/${key.value}/${encodeURIComponent(path.value)}`, {  method: 'GET', params: clone({ ...siteStore.params, path:path.value }) })//.then(({ data }) => data);
  
    if(error.value || !data.value) throw  createError({ statusCode: 404, statusMessage: `Page not found for path: ${path}` }) 

    return data
  }

  async function getMenus(){
    if(menuStore.isLoaded) return undefined;

    return useFetch(`/api/menus`, { params: clone({...siteStore.params, path:to.path})})
  }

  async function getMe(){
    if(meStore.isAuthenticated) return;
    const { data, error } = await useFetch(`/api/me`, {  method: 'GET' })//.then(({ data }) => data);

    meStore.initialize(data)
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

