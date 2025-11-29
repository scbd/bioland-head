import clone         from 'lodash.clonedeep';
import isPlainObject from 'lodash.isplainobject';

export default defineNuxtRouteMiddleware(async (to, from) => {
  const nuxtApp     = useNuxtApp();
  const path        = to.path;

  // Check for component viewer routes early - before any other processing
  const isComponentRoute = path.match(/^\/[a-z]{2}\/components\//);
  
  if (isComponentRoute) {
    return; // Exit middleware entirely for component routes
  }

  await changeLocale();

  const siteStore   = useSiteStore(nuxtApp.$pinia);
  const pStore      = usePageStore(nuxtApp.$pinia);
  const menuStore   = useMenusStore(nuxtApp.$pinia);
  const meStore     = useMeStore(nuxtApp.$pinia);
  const context     = useCookie('context');

  const requestCookieHeader = useRequestHeaders(['cookie']);
  const clientCookie        = useCookie(hasSessionCookieClient())

  updateAppConfig({ path });

  isValidLocalePrefix();
  
  if(!context.value || !siteStore.siteCode) return reloadNuxtApp();
  
  await getMe();

  const locale = nuxtApp.$i18n?.locale?.value || siteStore.locale || 'en';
  const   getPage          = useGetPage(locale);
  const [ pData, fetch ]   = await Promise.all([getPage(path), getMenus()]);
  const { data: menuData } = fetch || { data: undefined};

  if(!pData) return;
  if(pData?.redirect) {
    await abortNavigation();
    
    return navigateTo({ path: pData.redirect, query: to.query  }, { redirectCode: 301 });
  }

  pStore.initialize(pData);

  if(menuData?.value)
    menuStore.loadAllMenus(menuData.value);


  function isValidLocalePrefix(){

    
    const { locales} = useRuntimeConfig().public;
    const   preFixes = locales.map(({ code })=> code);

    const defaultLocale = siteStore.defaultLocale || 'en';
    const isValid = preFixes.includes(to.path.split('/')[1]);


    if(!isValid) return navigateTo(`/${defaultLocale}${to.path}`);
}

  function isLocaleChange(){
    if(!nuxtApp.$i18n) return false;
    
    const { locale } = nuxtApp.$i18n;

    if(to.path.startsWith(`/${locale.value}`)) return false;

    return to.path.split('/')[1];
  }

  async function changeLocale(){
    const isChange = isLocaleChange();

    if(!isChange) return;

    if(nuxtApp.$i18n) {
      nuxtApp.$i18n.setLocale(isChange)
      await nuxtApp.$i18n.waitForPendingLocaleChange()
    }
  }
  
  async function getMenus(){
    if(menuStore.isLoaded || !context.value) return undefined;

    return useFetch(`/api/menus`, { query: clone({ ...siteStore.params, path:to.path })});
  }

  async function getMe(){

    try{
      const headers = requestCookieHeader?.cookie?.includes('SSESS')? requestCookieHeader: ({ cookie: {[hasSessionCookieClient()]:clientCookie.value}})

      const { data, error } = await useFetch(`/api/me`, {  method: 'GET',headers,  query: clone({...siteStore.params, path:to.path})})//.then(({ data }) => data);

      if(!error.value) meStore.initialize(data)
    }catch(e){
      console.error(e)

      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Error getting user'})
    }
  

  }

  function updateAppConfig(updateCtx){
    if(!context.value || !isPlainObject(context.value)) context.value = {};

    for(const key in updateCtx)
      if(context.value[key] !== updateCtx[key])
            context.value[key] = updateCtx[key];
  }
})