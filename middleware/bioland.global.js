import clone from 'lodash.clonedeep';

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp     = useNuxtApp()

  const siteStore   = useSiteStore(nuxtApp.$pinia);
  const pStore      = usePageStore(nuxtApp.$pinia);
  const menuStore   = useMenusStore(nuxtApp.$pinia)
  const meStore     = useMeStore(nuxtApp.$pinia)
  const context     = useCookie('context');
  // const isNewLocale = isLocaleChange(to, from) && !!pStore.drupalInternalNid;

 // const localePath  = siteStore.locale //siteStore.locale === siteStore.defaultLocale? '' : `/${siteStore.locale}`;
  const path        = to.path//isNewLocale? `${localePath}/node/${pStore.drupalInternalNid}` : to.path;




  // if(!context.value){
  //    context.value = {};
     
  // }
  // context.value.path = path;

    await getMe();

  const [ pData, fetch ]= await Promise.all([getPage(path), getMenus()])

  const { data: menuData } = fetch || { data: undefined};
  

  if(!pData) return


  pStore.initialize(pData)


  if(menuData?.value)
    menuStore.loadAllMenus(menuData.value);

  async function getPage(passedPath){ 

    const path = ref(passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath);
    const { multiSiteCode } = useRuntimeConfig().public;
    const { identifier,  locale } = siteStore;

    const key = ref(`${multiSiteCode}-${identifier}-${locale}-${encodeURIComponent(path.value)}`);

    try{
      const  data  = await $fetch(`/api/page/${key.value}/${encodeURIComponent(path.value)}`, {  method: 'GET', query: clone({ ...siteStore.params, path:path.value }) })//.then(({ data }) => data);
  
      return data
    }catch(e){
        throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}` }) 
    }

  }

  async function getMenus(){
    if(menuStore.isLoaded) return undefined;

    return useFetch(`/api/menus`, { query: clone({...siteStore.params, path:to.path})})
  }

  async function getMe(){
    if(!siteStore.params?.siteCode)return consola.warn('get me- no contenxt')
    if(meStore.isAuthenticated && !meStore.isExpired) return;

    const { data, error } = await useFetch(`/api/me`, {  method: 'GET', query: clone({...siteStore.params, path:to.path})})//.then(({ data }) => data);


    if(!error.value) meStore.initialize(data)
  }


})

// function isLocaleChange({ name: to }, { name: from }){

//   const toLocale   = getLocaleFromRouteName(to);
//   const fromLocale = getLocaleFromRouteName(from);

//   return toLocale !== fromLocale;
// }

// function getLocaleFromRouteName(name){
//   if(!name)return '';
//   const indexToSlice = name.lastIndexOf('_');
//   return name.slice(indexToSlice + 1);
// }

