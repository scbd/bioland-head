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

                // Every value below goes through the same normaliser; comparing two
                // differently-normalised hosts is what turns this guard into a redirect loop.
                //
                // TRUST ASSUMPTION: `x-forwarded-host` is read ahead of `Host`, so the
                // cross-host redirect below is only safe where the edge (CDN/ALB/ingress)
                // strips or overwrites any client-supplied value. That edge control is an
                // external rollout prerequisite this handler cannot verify - see AADR 0002
                // and the multi-tenant isolation rows in docs/architecture.md / docs/prd.md.
                const requestHost = toComparableHost(getRequestHost(event, { xForwardedHost: true }));

                if(LOOPBACK_HOSTS.has(requestHost) || requestHost.endsWith('.localhost')) return false;

                const ctx = await useRequestContext(event);

                const generatedHost = toComparableHost(getGeneratedHostname(ctx.siteCode, ctx.baseHost));
                const canonicalHost = toComparableHost(ctx.host);

                // Only ever redirect away from the generated Host, never toward it.
                if(!requestHost || requestHost !== generatedHost) return false;

                // The canonical Host comes from operator free text; if it does not
                // normalise to a hostname, send nothing rather than a broken Location.
                if(!canonicalHost) return false;

                // Already canonical (the dark case, and every redirect-Host visitor).
                if(requestHost === canonicalHost) return false;

                // Rebuild the origin from the normalised host, so a scheme- or port-bearing
                // `redirect` value can never leak into the Location header.
                // event.path already carries the query string; appending it again duplicates it.
                //
                // Deliberately 302, not 301: a permanent redirect is cached by browsers
                // indefinitely, so a wrong target would survive a deploy or a DMSM fix with
                // no server-side recovery. This becomes 301 once a pilot Site has run clean.
                await sendRedirect(event, `https://${canonicalHost}${event.path}`, 302);

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

/** Hosts that are never multisite Hosts, so never worth a canonical redirect. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Reduces a Host header, an origin, or an operator-supplied `redirect` value to one
 * comparable hostname: first x-forwarded-host entry, no scheme, no userinfo, no path,
 * no port, no trailing dot, lowercased, bracketed IPv6 literals preserved.
 *
 * Both sides of every host comparison in this file must come from this function -
 * two normalisers disagreeing about one request is what produces a redirect loop.
 *
 * Its comma/port/IPv6 handling must stay in step with `normalizeHost` in
 * server/utils/context-unified.ts, which derives `siteCode` from the same header.
 * That helper is module-private there, so the behaviour is mirrored, not shared.
 *
 * @param {string} value - A raw Host header, an origin, or a configured redirect host.
 * @returns {string} The comparable hostname, or '' when no sane hostname can be derived.
 */
function toComparableHost(value) {
    // x-forwarded-host is legitimately a comma-separated list; the first entry is the original Host.
    const first = String(value ?? '').split(',')[0].trim();

    // `redirect` free text may carry a scheme, and getCanonicalHost prefixes another.
    const withoutScheme = first.replace(/^(?:https?:\/\/)+/i, '');
    const hostOnly = withoutScheme.split('/')[0].split('@').pop().trim().toLowerCase();

    // Bracketed IPv6 literal ("[::1]:3000"): keep the brackets, drop any port.
    if(hostOnly.startsWith('[')) {
        const closingBracket = hostOnly.indexOf(']');
        return closingBracket > 1 ? hostOnly.slice(0, closingBracket + 1) : '';
    }

    // Bare IPv6 literal ("::1"): it cannot carry a port unbracketed, so keep it whole.
    if(hostOnly.indexOf(':') !== hostOnly.lastIndexOf(':')) return hostOnly;

    const bare = hostOnly.replace(/:\d+$/, '').replace(/\.$/, '');

    // Anything still holding a scheme, port, credential, space or empty label is not a hostname.
    return /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(bare) ? bare : '';
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
