export default defineNitroPlugin((nitro) => {
    
    nitro.hooks.hook("request", async (event) => {

        const skipPaths = ['/_i18n','/_ipx','/api','/__nuxt_error','/_nuxt','/sites','/images','/favicon.ico','/.well-known','/fonts.googleapis.com','/.well-known/appspecific'];

        // Check if path should be skipped
        for(let path of skipPaths) {
            if(event.path.includes(path)) return;
        }

        // A host redirect is terminal for this request; the path handlers below never run with it.
        if (await handleHostRedirect()) return;

        await handleMalformedPaths();
        await handleLocaleRedirect();
        await handleTaxonomyTermAlias();

        /**
         * Redirects malformed paths (duplicate locales, double slashes)
         */
        async function handleMalformedPaths() {
            try {
                const ctx = await useRequestContext(event);
                const correctedPath = getMalformedPathRedirect(event, ctx.locales);
                if (correctedPath) {
                    return sendRedirect(event, correctedPath, 301);
                }
            } catch (error) {
                return;
            }
        }


        async function handleLocaleRedirect(){
            try {
                // Use unified context (DMSM config is cached)
                const ctx = await useRequestContext(event);
                
                const defaultLocale  = ctx.defaultLocale;
                const pathLocale     = getPathLocale(event);
                const isValid        = ctx.locales.includes(pathLocale);

                // Redirect root path to defaultLocale
                if(event.path === '/') return sendRedirect(event, `/${defaultLocale}`, 301);


                // Redirect invalid locale paths
                if(!isValid && ctx.locales.length) {
                    return sendRedirect(event, `/${defaultLocale}${event.path}`, 301);
                }
            } catch (error) {
                // Context resolution failed - let request continue
                // The actual page handler can decide what to do
                return;
            }
        }

        /**
         * Redirects /taxonomy/term/{id} paths to their alias or homepage.
         */
        async function handleTaxonomyTermAlias(){
            try {
                const taxonomyTermMatch = event.path.match(/^\/([a-z]{2})\/taxonomy\/term\/(\d+)/);
                
                if(!taxonomyTermMatch) return;

                const locale = taxonomyTermMatch[1];
                const termId = taxonomyTermMatch[2];
                const termPath = `/taxonomy/term/${termId}`;
                
                const ctx = await useRequestContext(event);
                
                // Preserve query string in redirects
                const queryString = event.node.req.url?.split('?')[1];
                const queryPart = queryString ? `?${queryString}` : '';
                
                // If this term is the homepage, redirect to root
                if(ctx.homePath === termPath) {
                    return sendRedirect(event, `/${locale}${queryPart}`, 301);
                }
                
                // Otherwise, check if there's an alias for this term in the requested locale
                const allAliases = await getTermAliasById(ctx, termId, true);
                const aliasData = allAliases?.find(a => a.langcode === locale);
                
                if(aliasData?.alias) {
                    return sendRedirect(event, `/${locale}${aliasData.alias}${queryPart}`, 301);
                }
            } catch (error) {
                return;
            }
        }

        /**
         * Redirects a GET/HEAD request on a Site's generated Host to the same
         * path and query on its canonical Host, when the two differ.
         * @returns {Promise<boolean>} True when a redirect was sent, false otherwise.
         */
        async function handleHostRedirect(){
            try {
                if(event.method !== 'GET' && event.method !== 'HEAD') return false;

                // h3's getRequestHost keeps the port; strip it before comparing.
                const requestHost = getRequestHost(event, { xForwardedHost: true }).split(':')[0].toLowerCase();

                if(requestHost === 'localhost' || requestHost === '127.0.0.1' || requestHost.endsWith('.localhost')) return false;

                const ctx = await useRequestContext(event);

                const generatedHost = stripHostScheme(getGeneratedHostname(ctx.siteCode, ctx.baseHost));
                const canonicalHost = stripHostScheme(ctx.host);

                // Only ever redirect away from the generated Host, never toward it.
                if(requestHost !== generatedHost) return false;

                // Already canonical (the dark case, and every redirect-Host visitor).
                if(requestHost === canonicalHost) return false;

                // event.path already carries the query string; appending it again duplicates it.
                await sendRedirect(event, `${ctx.host}${event.path}`, 301);

                return true;
            } catch (error) {
                // Never throw inside a Nitro request hook - let the request continue.
                return false;
            }
        }
    });
})

/**
 * Locale Redirect Plugin
 * 
 * Handles locale prefix redirects:
 * - Root path "/" redirects to "/{defaultLocale}"
 * - Invalid locale paths redirect to "/{defaultLocale}/{path}"
 * 
 * Uses the unified context system (DMSM config is cached)
 */
// Server utils (useRequestContext) are auto-imported by Nuxt

/**
 * Extracts the locale segment from the event path, stripping query params.
 * @param {object} event - The H3 event object
 * @returns {string|undefined} The path locale (e.g., 'en') or undefined if not present
 */
function getPathLocale(event) {
    const pathWithoutQuery = event.path.split('?')[0];
    const segments = pathWithoutQuery.split('/');
    return segments[1] || undefined;
}

/**
 * Reduces an origin or Host value to a bare, comparable hostname.
 * @param {string} value - An origin ("https://be.example.org") or a bare Host.
 * @returns {string} The lowercased hostname with any scheme removed.
 */
function stripHostScheme(value) {
    return String(value || '').replace(/^https?:\/\//i, '').toLowerCase();
}

/**
 * Handles malformed paths by:
 * 1. Removing duplicate locale prefixes (e.g., /en/en/news → /en/news)
 * 2. Replacing double slashes with single slashes
 * @param {object} event - The H3 event object
 * @param {string[]} locales - Array of valid locale codes
 * @returns {string|null} The corrected path if malformed, null otherwise
 */
function getMalformedPathRedirect(event, locales) {
    let path = event.path;
    let corrected = path;
    
    // Fix double slashes anywhere in the path (but preserve query string)
    const [pathPart, queryPart] = corrected.split('?');
    const fixedPath = pathPart.replace(/\/\/+/g, '/');
    corrected = queryPart ? `${fixedPath}?${queryPart}` : fixedPath;
    
    // Check for duplicate locale prefix (e.g., /en/en/...)
    const segments = corrected.split('?')[0].split('/').filter(Boolean);
    if (segments.length >= 2) {
        const first = segments[0];
        const second = segments[1];
        if (first === second && locales.includes(first)) {
            // Remove the duplicate locale
            segments.splice(1, 1);
            const newPath = '/' + segments.join('/');
            corrected = queryPart ? `${newPath}?${queryPart}` : newPath;
        }
    }
    
    // Return corrected path only if it differs from original
    return corrected !== path ? corrected : null;
}
