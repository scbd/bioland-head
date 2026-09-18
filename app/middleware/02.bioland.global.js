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
  
  // Components that need store data (menus, site context) to render properly
  const componentsNeedingStores = [
    'widget-content-types-stats',
  ];
  
  // Check if this component route needs store data
  const componentName = isComponentRoute ? path.split('/components/')[1]?.split('?')[0] : null;
  const needsStoreData = componentName && componentsNeedingStores.includes(componentName);
  
  if (isComponentRoute && !needsStoreData) {
    return; // Exit middleware entirely for component routes that don't need stores
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
  
  // For component routes that need stores, only fetch menus (no page data)
  if (isComponentRoute && needsStoreData) {
    const { data: menuData } = await getMenus() || { data: undefined };
    if (menuData?.value) {
      menuStore.loadAllMenus(menuData.value);
    }
    return; // Skip page fetch for component routes
  }
  
  const [ pData, fetch ]   = await Promise.all([getPage(path), getMenus()]);
  const { data: menuData } = fetch || { data: undefined};

  if(!pData) return;
  if(pData?.redirect) {
    await abortNavigation();
    
    return navigateTo({ path: pData.redirect, query: to.query  }, { redirectCode: 301 });
  }

  pStore.initialize(pData);

  applyDocumentCacheTtl();

  if(menuData?.value)
    menuStore.loadAllMenus(menuData.value);


  /**
   * Overrides the flat document Cache-Control set by `server/middleware/cache-control.js` with an
   * age-tiered TTL derived from the Drupal node's `changed` date (BL-1059).
   *
   * That middleware cannot do this itself: it runs before the node is fetched, so the only TTL it
   * can pick is a flat one. Here the node is in hand, so an old page can safely be cached for far
   * longer than a page edited this morning - which is what stops nearly every visitor triggering a
   * 3-5s origin render.
   *
   * Deliberately skipped in four cases, each of which would be a correctness bug, not a missed
   * optimisation:
   * - Client-side navigation. There is no response to set a header on.
   * - Authenticated requests. The rendered HTML carries edit affordances and other per-user state;
   *   handing that to a shared CDN for up to a month would leak it to anonymous visitors. At the
   *   old 15s TTL this was near-harmless, at a month it is not.
   * - Aggregate routes - search, the forum and NCP listings, the CHM network page. Their node's
   *   `changed` date describes the container, not the live results rendered into it, so tiering by
   *   it would pin a stale result set at the CDN. `pageStore.isPage` already draws exactly this
   *   line for rendering, so it is reused rather than restated.
   * - An untrusted `changed` date. `resolveDocumentCacheTtl` returns null, and the middleware's
   *   existing 15s default stands.
   *
   * The home page is a special case: its own node is usually years old, but it renders live widgets
   * (latest news, discussions, GBIF) whose data is fetched during SSR and baked into the payload.
   * Tiering it by node age would serve week-old news, so its TTL is capped at the youngest tier.
   *
   * @returns {void}
   */
  function applyDocumentCacheTtl(){
    if(!import.meta.server) return;

    if(meStore.isAuthenticated) return;

    if(!pStore.isPage && !pStore.isMediaPage) return;

    const tiered = resolveDocumentCacheTtl(pStore.page?.changed);

    if(tiered === null) return;

    const ttl = siteStore.isHomePage ? Math.min(tiered, CACHE_TTL.FIVE_MINUTES) : tiered;

    // Read off the captured nuxtApp rather than useRequestEvent(): this runs after several awaits,
    // where a composable can no longer resolve the Nuxt context. Writing the raw node header is also
    // what server/middleware/cache-control.js does, so the two stay symmetrical - h3's
    // setResponseHeader is a server-only auto-import and is not available in app middleware.
    const res = nuxtApp.ssrContext?.event?.node?.res;

    if(!res || res.headersSent) return;

    res.setHeader('Cache-Control', buildDocumentCacheControl(ttl));
  }

  /**
   * Validates that the URL has a proper locale prefix (e.g., /en/, /fr/).
   * If the locale prefix is missing or invalid, redirects to the default locale.
   * Also removes duplicate locale prefixes to prevent redirect loops.
   * 
   * @returns {void|NavigateToOptions} Redirect if invalid, undefined if valid
   */
  function isValidLocalePrefix(){
    const { locales} = useRuntimeConfig().public;
    const   preFixes = locales.map(({ code })=> code);

    // siteStore.defaultLocale is guaranteed to be set by site.js plugin
    // which runs before this middleware
    const defaultLocale = siteStore.defaultLocale;
    const pathSegments = to.path.split('/').filter(Boolean); // Remove empty strings
    const pathLocale = pathSegments[0];
    
    if(!defaultLocale) {
      // This should never happen - plugin ensures defaultLocale is set
      console.error('defaultLocale not set in siteStore - plugin may have failed');
      return;
    }
    
    // Handle root path: / should redirect to /${defaultLocale}
    if(!pathLocale || pathSegments.length === 0) {
      return navigateTo(`/${defaultLocale}`);
    }
    
    const isValid = preFixes.includes(pathLocale);

    // Check if there are duplicate locale prefixes (e.g., /en/en/page or /en/fr/page)
    if(isValid && pathSegments.length > 1 && preFixes.includes(pathSegments[1])) {
      // Remove all consecutive locale prefixes, keep only the first valid one
      let cleanSegments = [pathSegments[0]];
      let i = 1;
      // Skip any additional locale codes
      while(i < pathSegments.length && preFixes.includes(pathSegments[i])) {
        i++;
      }
      // Add remaining path segments (if any exist after removing duplicate locales)
      if(i < pathSegments.length) {
        cleanSegments = cleanSegments.concat(pathSegments.slice(i));
      }
      // If only locale prefixes existed, cleanSegments will just be [locale]
      const cleanPath = '/' + cleanSegments.join('/');
      return navigateTo(cleanPath.replace(/\/{2,}/g, '/'), { redirectCode: 301, replace: true });
    }

    if(!isValid) {
      // Invalid or missing locale prefix: replace with default locale
      const pathWithoutFirstSegment = pathSegments.slice(1).join('/');
      const correctedPath = pathWithoutFirstSegment ? `/${defaultLocale}/${pathWithoutFirstSegment}` : `/${defaultLocale}`;
      // Normalize multiple consecutive slashes to single slash
      return navigateTo(correctedPath.replace(/\/{2,}/g, '/'), { redirectCode: 301, replace: true });
    }
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
  async function getMe() {
    try {
      const headers = getAuthCookieHeaders();
      const { data, error } = await useFetch(`/api/me`, {
        method: 'GET',
        headers,
        query: clone({ ...siteStore.params, path: to.path })
      });

      if (!error.value && data.value) meStore.initialize(data);
    } catch (e) {
      console.error(e);
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Error getting user' });
    }
  }

  /**
   * Builds the authentication cookie headers for Drupal API requests.
   * 
   * Priority order:
   * 1. SSESS cookie from incoming request headers (SSR with authenticated user)
   * 2. localDrupalSession from env (localhost dev fallback for first request)
   * 3. Client-side cookie (browser navigations)
   * 
   * The localhost-dev middleware sets a cookie from localDrupalSession,
   * but on the FIRST request that cookie won't be in requestCookieHeader yet.
   * So we still need the env fallback for that first request.
   * 
   * @returns {{ cookie: string|object }} Headers object with cookie
   */
  function getAuthCookieHeaders() {
    // 1. Check if request already has SSESS cookie (normal authenticated flow)
    if (requestCookieHeader?.cookie?.includes('SSESS')) {
      return requestCookieHeader;
    }

    // 2. Localhost dev fallback: use env var for first request (server-side only)
    const { public: { isLocalHost } } = useRuntimeConfig();
    const localDrupalSession = import.meta.server ? useRuntimeConfig().localDrupalSession : null;
    
    if (isLocalHost && localDrupalSession) {
      return { cookie: localDrupalSession };
    }

    // 3. Client-side: use cookie from browser
    return { cookie: { [hasSessionCookieClient()]: clientCookie.value } };
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
      siteStore.initialize({ ...data, ...{
        locale: data?.locale,
        identifier: data?.siteCode,
        siteCode: data?.siteCode,
        defaultLocale: data?.defaultLocale,
        config: data?.config,
        siteName: data?.siteName,
        gaiaApi: runtime?.gaiaApi,
        multiSiteCode: runtime?.multiSiteCode,
        baseHost: runtime?.baseHost,
        env: runtime?.env,
        homePath: data?.homePath
      }});

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

  function isKnownDevHost(host, baseHost) {
    if(!host) return false;

    return host === 'localhost'
      || host === '127.0.0.1'
      || host.endsWith('.localhost')
      || (baseHost ? host.endsWith(`.${baseHost}`) : false);
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

    const { baseHost } = useRuntimeConfig().public;
    if(!isKnownDevHost(hostName, baseHost)) return null;

    const parts = hostName.split('.');
    return parts.length > 1 ? parts[0] : null;
  }
})