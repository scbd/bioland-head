/**
 * Localhost Development Middleware
 * 
 * This middleware handles localhost-specific functionality:
 * 1. Sets SSESS cookie from localDrupalSession env var (cross-domain workaround)
 * 2. Redirects /sites/ paths to external host (cross-domain proxy)
 * 
 * Only runs when isLocalHost is true.
 */
export default defineNuxtRouteMiddleware(async (to, from) => {
    const { isLocalHost } = useRuntimeConfig().public;

    if(!isLocalHost) return;

    // Set Drupal session cookie from env var (server-side only)
    // This allows local dev to authenticate against staging/prod Drupal
    // without needing cross-domain cookie access
    setLocalDrupalSessionCookie();

    // Handle /sites/ path redirect to external host
    // Must return the navigateTo result for redirect to work
    const sitesRedirect = redirectSitesPath(to);
    if (sitesRedirect) return sitesRedirect;
});

/**
 * Sets the Drupal SSESS cookie from localDrupalSession env variable.
 * 
 * WHY THIS EXISTS:
 * - In local dev, the browser can't set cookies for staging Drupal domain
 * - localDrupalSession contains a valid SSESS cookie string from staging
 * - We set it as a cookie on localhost so subsequent requests include it
 * 
 * This runs on every request but only sets the cookie once (if not already present).
 * 
 * @returns {void}
 */
function setLocalDrupalSessionCookie() {
    if (import.meta.client) return; // Server-side only
    
    const localDrupalSession = useRuntimeConfig().localDrupalSession;
    
    if (!localDrupalSession) return;
    
    // Parse the cookie string (e.g., "SSESSabc123=sessionvalue")
    const { name, value } = parseCookieString(localDrupalSession);
    
    if (!name || !value) return;
    
    // Check if cookie already exists
    const existingCookie = useCookie(name);
    
    if (existingCookie.value) return; // Already set
    
    // Set the cookie for localhost domain
    existingCookie.value = value;
}

/**
 * Parses a cookie string into name and value.
 * 
 * @param {string} cookieString - Cookie string like "SSESS123=value" or "SSESS123=value; path=/"
 * @returns {{ name: string|null, value: string|null }}
 */
function parseCookieString(cookieString) {
    if (!cookieString || typeof cookieString !== 'string') {
        return { name: null, value: null };
    }
    
    // Take only the first part before any semicolon (ignore path, domain, etc.)
    const mainPart = cookieString.split(';')[0].trim();
    const separatorIndex = mainPart.indexOf('=');
    
    if (separatorIndex === -1) {
        return { name: null, value: null };
    }
    
    const name = mainPart.substring(0, separatorIndex).trim();
    const value = mainPart.substring(separatorIndex + 1).trim();
    
    return { name, value };
}

/**
 * Redirects /sites/ paths to the external host.
 * 
 * The /sites/ path serves static files from Drupal and cannot be proxied
 * through the Nuxt server due to cross-domain restrictions.
 * 
 * @param {RouteLocationNormalized} to - The target route
 * @returns {void|NavigateToOptions}
 */
function redirectSitesPath(to) {
    if (!to.path.startsWith('/sites/')) return;

    const nuxtApp = useNuxtApp();
    const siteStore = useSiteStore(nuxtApp.$pinia);

    return navigateTo(`${siteStore.getHost(true)}${to.path}`, { external: true });
}