import clone from 'lodash.clonedeep';
import isPlainObject from 'lodash.isplainobject';

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp     = useNuxtApp()
  const siteStore   = useSiteStore(nuxtApp.$pinia);
  const pStore      = usePageStore(nuxtApp.$pinia);
  const menuStore   = useMenusStore(nuxtApp.$pinia)
  const meStore     = useMeStore(nuxtApp.$pinia)
  const context     = useCookie('context');

  const path        = to.path;


  await changeLocale()
  
  // if(!context.value)
  //   throw createError({ 
  //     statusCode: 404, 
  //     statusMessage: 'Not Found',
  //     message: `no context`,
  //     fatal:true
  // });

  updateAppConfig({ path })
  // isValidLocalePrefix();
  await getMe();

  const [ pData, fetch ]= await Promise.all([getPage(path), getMenus()])

  const { data: menuData } = fetch || { data: undefined};
  

  if(!pData) return


  pStore.initialize(pData)

 
  if(menuData?.value)
    menuStore.loadAllMenus(menuData.value);

  async function getPage(passedPath){ 
    
    const   path                  = ref(passedPath.endsWith('/topics')? passedPath.replace('/topics', '') : passedPath);
    const { multiSiteCode }       = useRuntimeConfig().public;
    const { identifier,  locale } = siteStore;

    const key = ref(`${multiSiteCode}-${identifier}-${locale}-${encodeURIComponent(path.value)}`);

    try{
      if(key.value?.includes('undefined'))  throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}` }) 

      const  data  = await $fetch(`/api/page/${key.value}/${encodeURIComponent(path.value)}`, {  method: 'GET', query: clone({ ...siteStore.params, path:path.value }) })//.then(({ data }) => data);
  
      return data;
    }catch(e){
      consola.error(e)

      if(e.statusCode === 404)
        throw createError({ statusCode: 404, statusMessage: `Page not found for path: ${path.value}`, fatal:true })
  
      throw createError({ statusCode: e.statusCode, statusMessage: e.statusMessage, fatal:true }) 
    }

  }

  function isValidLocalePrefix(){

    
    const { locales} = useRuntimeConfig().public;
    const   preFixes = locales.map(({ code })=> code);

    const defaultLocale = siteStore.defaultLocale || 'en'
    const isValid = preFixes.includes(to.path.split('/')[1])

    if(!isValid) consola.warn('isValidLocalePrefix', to.path, defaultLocale)
    if(!isValid) return navigateTo(`/${defaultLocale}${to.path}`)
}

  function isLocaleChange(){
    const { locale } = nuxtApp.$i18n;

    if(to.path.startsWith(`/${locale.value}`)) return false;

    return to.path.split('/')[1]
  }

  async function changeLocale(){
    const isChange = isLocaleChange();

    if(!isChange) return;

    nuxtApp.$i18n.setLocale(isChange)

    await nuxtApp.$i18n.waitForPendingLocaleChange()
  }
  
  async function getMenus(){
    if(menuStore.isLoaded || !context.value) return undefined;

    
    return useFetch(`/api/menus`, { query: clone({...siteStore.params, path:to.path})})
  }

  async function getMe(){

    try{
      if(meStore.isAuthenticated && !meStore.isExpired) return;

      const { data, error } = await useFetch(`/api/me`, {  method: 'GET', query: clone({...siteStore.params, path:to.path})})//.then(({ data }) => data);


      if(!error.value) meStore.initialize(data)
    }catch(e){
      console.error(e)

      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Error getting user'})
    }
  

  }

  function updateAppConfig(updateCtx){
    if(!context.value || !isPlainObject(context.value)) context.value = {};

    for(const key in updateCtx)
        context.value[key] = updateCtx[key];
  }
})
