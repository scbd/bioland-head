import clone from 'lodash.clonedeep';

/**
 * Bioland Global Route Middleware
 * 
 * This middleware runs on EVERY route navigation (both SSR and client-side).
 * It is responsible for:
 * 1. Ensuring site context (siteCode, locale, config) is available
 * 2. Validating and redirecting locale prefixes
 * 3. Fetching page data and menus
 * 4. Initializing Pinia stores with fetched data
 * 
 * EXECUTION ORDER:
 * - Nuxt plugins run first (site.js should initialize siteStore)
 * - Then route middleware runs (this file)
 * - Then page components render
 * 
 * PROBLEM THIS SOLVES:
 * On the very first SSR request, there's no context cookie yet.
 * The site.js plugin SHOULD initialize siteStore, but due to timing issues
 * or plugin failures, the store may be empty when this middleware runs.
 * 
 * SOLUTION:
 * ensureSiteContext() acts as a safety net - if siteStore is empty,
 * it fetches context directly from the API before proceeding.
 * This guarantees context is ALWAYS available before page rendering.
 */
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

  const requestCookieHeader = useRequestHeaders(['cookie']);
  const clientCookie        = useCookie(hasSessionCookieClient())

  // Path is NOT stored in cookie - it's passed directly to API calls
  // Context cookie only stores: siteCode, locale, defaultLocale, locales

  /**
   * CRITICAL: Ensure site context is available before ANY other operations.
   * 
   * Why this exists:
   * - The site.js plugin should initialize siteStore before middleware runs
   * - However, on first SSR hit (no cookie), timing issues can cause the store to be empty
   * - Without context, we can't fetch pages, menus, or render anything meaningful
   * 
   * What it does:
   * - Checks if siteStore already has data (happy path - plugin worked)
   * - If empty, fetches context from /api/context/{siteCode}/{locale}
   * - Initializes siteStore with the fetched data
   * - Sets the context cookie for subsequent requests
   * 
   * This guarantees that siteStore.siteCode, siteStore.host, etc. are ALWAYS
   * available when components render, preventing "undefined" in URLs.
   */
  await ensureSiteContext();

  isValidLocalePrefix();
  
  /**
   * Final safety check after ensureSiteContext.
   * 
   * If we STILL don't have siteCode after the fallback fetch, something is
   * seriously wrong (network error, invalid hostname, DMSM down, etc.)
   * 
   * Client-side: Reload the app to re-trigger the full initialization flow
   * Server-side: Log error and return early (page will render empty, but won't crash)
   */
  if(!siteStore.siteCode) {
    if(import.meta.client) return reloadNuxtApp();
    console.error('[middleware] Failed to initialize site context');
    return;
  }
  
  await getMe();

  // Use siteStore.locale which is guaranteed to be set by the site plugin
  const locale = nuxtApp.$i18n?.locale?.value || siteStore.locale || siteStore.defaultLocale;
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


  /**
   * Validates that the URL has a proper locale prefix (e.g., /en/, /fr/).
   * If the locale prefix is missing or invalid, redirects to the default locale.
   * 
   * @returns {void|NavigateToOptions} Redirect if invalid, undefined if valid
   */
  function isValidLocalePrefix(){
    const { locales} = useRuntimeConfig().public;
    const   preFixes = locales.map(({ code })=> code);

    // siteStore.defaultLocale is guaranteed to be set by site.js plugin
    // which runs before this middleware
    const defaultLocale = siteStore.defaultLocale;
    const pathLocale = to.path.split('/')[1];
    
    if(!defaultLocale) {
      // This should never happen - plugin ensures defaultLocale is set
      console.error('defaultLocale not set in siteStore - plugin may have failed');
      return;
    }
    
    const isValid = preFixes.includes(pathLocale);

    if(!isValid) return navigateTo(`/${defaultLocale}${to.path}`);
}

  /**
   * Detects if the user is navigating to a different locale.
   * Compares the current i18n locale with the locale in the URL path.
   * 
   * @returns {string|false} The new locale code if changing, false if not
   */
  function isLocaleChange(){
    if(!nuxtApp.$i18n) return false;
    
    const { locale } = nuxtApp.$i18n;

    if(to.path.startsWith(`/${locale.value}`)) return false;

    return to.path.split('/')[1];
  }

  /**
   * Updates the i18n locale if the URL indicates a locale change.
   * Waits for the locale change to complete before continuing.
   * 
   * @returns {Promise<void>}
   */
  async function changeLocale(){
    const isChange = isLocaleChange();

    if(!isChange) return;

    if(nuxtApp.$i18n) {
      nuxtApp.$i18n.setLocale(isChange)
      await nuxtApp.$i18n.waitForPendingLocaleChange()
    }
  }
  
  /**
   * Fetches all menu data if not already loaded.
   * Menus are cached in menuStore.isLoaded to avoid refetching on every navigation.
   * 
   * @returns {Promise<undefined|FetchResult>} Menu fetch result, or undefined if already loaded
   */
  async function getMenus(){
    if(menuStore.isLoaded) return undefined;

    return useFetch(`/api/menus`, { query: clone({ ...siteStore.params, path:to.path })});
  }

  /**
   * Fetches the current user's authentication state and roles.
   * Uses Drupal session cookies (SSESS*) to authenticate.
   * 
   * @returns {Promise<void>}
   * @throws {Error} If the /api/me request fails
   */
  async function getMe(){

    try{
      // Check for SSESS cookie in request, client cookie, or env fallback (localhost dev)
      const { public: { isLocalHost }, localDrupalSession } = useRuntimeConfig();
      const envSession = isLocalHost && localDrupalSession ? localDrupalSession : null;
      
      const headers = requestCookieHeader?.cookie?.includes('SSESS')
        ? requestCookieHeader
        : envSession
          ? { cookie: envSession }
          : { cookie: { [hasSessionCookieClient()]: clientCookie.value } }

      const { data, error } = await useFetch(`/api/me`, {  method: 'GET',headers,  query: clone({...siteStore.params, path:to.path})})//.then(({ data }) => data);

      if(!error.value && data.value) meStore.initialize(data)
    }catch(e){
      console.error(e)

      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Error getting user'})
    }
  

  }

  /**
   * Ensures site context is available in siteStore.
   * 
   * PURPOSE:
   * This is the middleware's safety net for context initialization.
   * The site.js plugin should normally handle this, but on first SSR requests
   * (no cookie) or if the plugin fails, siteStore may be empty.
   * 
   * WHY IT'S NEEDED:
   * - Components like hero-image.vue use siteStore.host to build image URLs
   * - If siteStore.host is undefined, URLs become "https://undefined.undefined/..."
   * - This breaks hero images, page titles, and any component using site context
   * 
   * HOW IT WORKS:
   * 1. Check if siteStore already has required fields (siteCode, locale, defaultLocale)
   * 2. If yes, return immediately (plugin worked correctly)
   * 3. If no, derive siteCode from hostname (e.g., "be.localhost" → "be")
   * 4. Fetch context from /api/context/{siteCode}/{locale}
   * 5. Initialize siteStore with the response
   * 6. Set context cookie so subsequent requests have context
   * 
   * @returns {Promise<void>}
   */
  async function ensureSiteContext(){
    // If siteStore already has context (from site plugin), we're done
    if(siteStore.siteCode && siteStore.locale && siteStore.defaultLocale) return;

    const runtime = useRuntimeConfig().public;

    // Derive site identifier from hostname (be.localhost -> be)
    const requestUrl = useRequestURL();
    const hostName = requestUrl?.hostname;
    const siteIdentifier = getSiteIdentifierFromHost(hostName);
    
    if(!siteIdentifier) {
      console.error('[middleware] Cannot derive siteCode from hostname:', hostName);
      return;
    }

    // Determine locale from URL path, fallback to 'und' (undefined) to let server use default
    const runtimeLocales = (runtime?.locales || []).map(({ code }) => code);
    const pathLocale = to.path.split('/')[1];
    const requestedLocale = runtimeLocales.includes(pathLocale) ? pathLocale : 'und';

    try {
      // Fetch context from server API (uses cached DMSM config)
      const data = await $fetch(`/api/context/${encodeURIComponent(siteIdentifier)}/${encodeURIComponent(requestedLocale)}`);

      // Initialize siteStore with fetched data + runtime config
      siteStore.initialize({
        locale: data?.locale,
        identifier: data?.siteCode,
        siteCode: data?.siteCode,
        defaultLocale: data?.defaultLocale,
        config: data?.config,
        siteName: data?.siteName,
        gaiaApi: runtime?.gaiaApi,
        multiSiteCode: runtime?.multiSiteCode,
        baseHost: runtime?.baseHost,
        env: runtime?.env
      });

      // Set context cookie for subsequent requests (SSR response will include Set-Cookie)
      const contextCookie = useCookie('context');
      if(!contextCookie.value && data?.siteCode) {
        contextCookie.value = {
          siteCode: data.siteCode,
          locale: data.locale,
          defaultLocale: data.defaultLocale,
          locales: data.locales
        };
      }
    } catch(e) {
      console.error('[middleware] Failed to fetch context:', e);
    }
  }

  /**
   * Extracts the site identifier from a hostname.
   * 
   * In the multi-site architecture, the site code is the first subdomain:
   * - "be.localhost" → "be" (Belgium site in dev)
   * - "be.chm-cbd.net" → "be" (Belgium site in production)
   * - "seed.chm-cbd.net" → "seed" (Seed/template site)
   * 
   * @param {string} hostName - The hostname to parse
   * @returns {string|null} The site identifier, or null if hostname is invalid
   */
  function getSiteIdentifierFromHost(hostName){
    if(!hostName) return null;
    const parts = hostName.split('.');
    return parts.length > 1 ? parts[0] : null;
  }
})