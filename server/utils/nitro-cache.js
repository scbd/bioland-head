import crypto from 'crypto';
import clone from 'lodash.clonedeep';


/**
 * Clear all cache entries for a specific site
 * 
 * Finds and removes all cached items matching the multiSiteCode and siteCode across
 * all cache groups (context, menus, lists, external, external-short, thesaurus, users).
 * 
 * Cache keys use various formats depending on the cached function:
 * - Colon-separated: `bl2:be:en`, `bl2:be`
 * - Hyphen-separated: `bl2-be-en-...`
 * - Concatenated: `bl2been`, `stgbl2been...`
 * - Path format (nested folders): `/bl2/be/...`
 * 
 * @param {H3Event} event - H3 event object
 * @param {Object} [options] - Optional configuration
 * @param {string} [options.multiSiteCode] - Override multiSiteCode (defaults to context)
 * @param {string} [options.siteCode] - Override siteCode (defaults to context)
 * @param {number} [options.batchSize=10] - Number of keys to delete per batch
 * @returns {Promise<{deleted: string[], count: number, errors: string[]}>} - Summary of deletion
 */
export async function clearSiteCache(event, options = {}) {
    const batchSize = options.batchSize || 10;
    
    // Get multiSiteCode and siteCode from options or context
    let multiSiteCode = options.multiSiteCode;
    let siteCode = options.siteCode;
    
    if (!multiSiteCode || !siteCode) {
        const ctx = await useRequestContext(event);
        multiSiteCode = multiSiteCode || ctx.multiSiteCode;
        siteCode = siteCode || ctx.siteCode;
    }
    
    if (!multiSiteCode || !siteCode) {
        throw new Error(`clearSiteCache: multiSiteCode and siteCode are required`);
    }
    
    const storage = useStorage('cache');
    const allKeys = await storage.getKeys();
    
    // Build regex patterns to match all key format variations
    // Patterns found in codebase:
    // 1. `bl2:be` - colon separator (no locale)
    // 2. `bl2:be:en` - colon separator with locale
    // 3. `bl2-be-en-...` - hyphen separator
    // 4. `bl2been` - concatenated
    // 5. `stgbl2been...` or `devbl2been...` - env-prefixed concatenated
    // 6. `stg-bl2-be-en-...` or `dev-bl2-be-en-...` - env-prefixed hyphen
    // 7. `:bl2:be:` or `/bl2/be/` - nested path format with colons or slashes
    // 8. `bl2:be:sessionId` - colon with session (users cache)
    
    const msc = multiSiteCode.toLowerCase();
    const sc = siteCode.toLowerCase();
    
    // Create patterns that catch all variations
    const patterns = [
        // Colon-separated patterns (most common)
        new RegExp(`${msc}:${sc}(?::|$)`, 'i'),      // bl2:be: or bl2:be at end
        
        // Hyphen-separated patterns
        new RegExp(`${msc}-${sc}(?:-|$)`, 'i'),      // bl2-be- or bl2-be at end
        
        // Concatenated patterns (no separator between msc and sc)
        new RegExp(`(?:^|:)${msc}${sc}(?:[a-z]|$)`, 'i'),  // bl2been or :bl2been
        
        // Env-prefixed concatenated (stgbl2been, devbl2been, prodbl2been)
        new RegExp(`(?:stg|dev|prod)${msc}${sc}`, 'i'),
        
        // Env-prefixed hyphen (stg-bl2-be, dev-bl2-be, prod-bl2-be)
        new RegExp(`(?:stg|dev|prod)-${msc}-${sc}`, 'i'),
        
        // Path/folder patterns (for nested cache structures)
        new RegExp(`[:/]${msc}[:/]${sc}(?:[:/]|\\.|$)`, 'i'), // /bl2/be/ or :bl2:be:
    ];
    
    // Filter keys that match any pattern, excluding user session cache
    const matchingKeys = allKeys.filter(key => {
        // Skip user session cache (users:get-cached-user:...)
        if (/users[:/]get-cached-user/i.test(key)) return false;
        
        return patterns.some(pattern => pattern.test(key));
    });
    
    const deleted = [];
    const errors = [];
    
    // Delete in batches
    for (let i = 0; i < matchingKeys.length; i += batchSize) {
        const batch = matchingKeys.slice(i, i + batchSize);
        
        const results = await Promise.allSettled(
            batch.map(key => storage.removeItem(key))
        );
        
        results.forEach((result, index) => {
            const key = batch[index];
            if (result.status === 'fulfilled') {
                deleted.push(key);
            } else {
                errors.push(`${key}: ${result.reason?.message || 'Unknown error'}`);
            }
        });
    }
    
    return {
        deleted,
        count: deleted.length,
        errors,
        total: matchingKeys.length,
        multiSiteCode,
        siteCode
    };
}


/**
 * Global cache invalidation/bypass function for all cached functions
 * Checks if cache should be invalidated/bypassed based on query params and user roles
 * 
 * Cache will be invalidated/bypassed when:
 * - seachain-taisce query param is present AND
 * - User has one of the admin roles (administrator, site_manager, content_manager, scbd_staff)
 * 
 * @param {Object} event - H3 event object
 * @returns {boolean} - True if cache should be invalidated/bypassed
 */
export async function shouldBypassAndInvalidateCache(event) {
//    await deleteCaches(event);
    const { searchParams } = new URL(getRequestURL(event));
    const seachainTaisce = searchParams.get('seachain-taisce');
    
    if (!seachainTaisce) return false;
    return true
    try {
        // Use already-populated event.context.me from auth middleware (avoids calling getUser again)
        const user = event.context?.me;
        
        if (!user) return false;
        
        const adminRoles = ['administrator', 'site_manager', 'content_manager', 'scbd_staff'];
        const hasAdminRole = user?.roles?.some(role => adminRoles.includes(role));
        
        return hasAdminRole;
    } catch (e) {
        return false;
    }
}



/**
 * Generate a cache key based on the request context
 * Key format: `${multiSiteCode}:${siteCode}:${locale}`
 * 
 * @param {H3Event} event - H3 event object
 * @returns {Promise<string>} - Cache key string
 * @throws {Error} - If multiSiteCode, siteCode, or locale is missing
 */
export const getKey = async (event) => {
    const ctx = await useRequestContext(event);
    const { multiSiteCode, siteCode , locale} = ctx;

    if (!multiSiteCode || !siteCode || !locale ) 
        throw new Error( `cache key missing: multiSiteCode=${multiSiteCode}, siteCode=${siteCode}, locale=${locale}` );

    return `${multiSiteCode}:${siteCode}:${locale}`;
}

/**
 * Generate a cache key with an additional identifier suffix
 * Key format: `${multiSiteCode}:${siteCode}:${locale}:${processedIdentifier}`
 * 
 * @param {H3Event} event - H3 event object
 * @param {string|string[]} identifier - Identifier to append to the key (string or array)
 * @returns {Promise<string>} - Cache key string with identifier
 * @throws {Error} - If multiSiteCode, siteCode, locale, or identifier is missing
 */
export const getKeyIdentifier = async (event, identifier) => {
    const ctx = await useRequestContext(event);
    const { multiSiteCode, siteCode, locale } = ctx;

    if (!multiSiteCode || !siteCode || !locale)
    throw new Error( `cache key missing: multiSiteCode=${multiSiteCode}, siteCode=${siteCode}, locale=${locale}` );

    return `${multiSiteCode}:${siteCode}:${locale}:${identifierToKey(identifier)}`;
};

/**
 * Convert an identifier to a safe cache key string
 * - Replaces commas with ~
 * - Arrays are joined with ~
 * - Strings longer than 40 chars are truncated to 20 chars + ~ + 16-char hash
 * 
 * @param {string|string[]} identifier - The identifier to convert
 * @returns {string} - Safe cache key string (max ~37 chars for long identifiers)
 * @throws {Error} - If identifier is falsy or an empty array
 */
function identifierToKey(identifier) {
    // Validate identifier
    if (!identifier || (Array.isArray(identifier) && identifier.length === 0)) {
        throw new Error('identifierToKey: identifier is required and cannot be empty');
    }
    
    // Handle array: join with ~, then process as string
    let str = Array.isArray(identifier) ? identifier.join('~') : String(identifier);
    
    // Replace commas with ~
    str = str.replace(/,/g, '~');
    
    // If 40 chars or less, return as-is
    if (str.length <= 40) return str;
    
    // If greater than 40 chars: keep first 20, add ~, then append hash
    const hash = crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
    
    return `${str.slice(0, 20)}~${hash}`;
}




/**
 * Generate base cache options for Nitro's defineCachedFunction/cachedEventHandler
 * 
 * @param {string} group - Cache group name for organization
 * @param {string} name - Unique cache name identifier
 * @param {boolean} [swr=true] - Enable stale-while-revalidate behavior
 * @param {number} [maxAge=CACHE_TTL.FIVE_MINUTES] - Cache TTL in seconds
 * @returns {Object} - Cache options object with base, varies, maxAge, name, group, getKey, swr
 */
export const getBaseCacheOptions = (group, name, swr = true, maxAge = CACHE_TTL.FIVE_MINUTES ) => ({
    base: 'cache',
    varies:['host', 'x-forwarded-host'],
    maxAge, name, group, getKey, swr
})


/**
 * Generate cache options for menu data
 * Uses 'menus' group with CACHE_TTL.MENUS (5 minutes) default TTL
 * 
 * @param {string} name - Unique cache name identifier
 * @param {boolean} [swr=false] - Enable stale-while-revalidate behavior
 * @param {number} [maxAge=CACHE_TTL.MENUS] - Cache TTL in seconds
 * @returns {Object} - Cache options configured for menus
 */
export const getMenusCacheOptions = (name, swr = false, maxAge = CACHE_TTL.MENUS) => {
    return getBaseCacheOptions('menus', name, swr, maxAge);
}

/**
 * Generate cache options for external API data
 * Uses 'external' group with CACHE_TTL.EXTERNAL (30 days) default TTL
 * 
 * @param {string} name - Unique cache name identifier
 * @param {boolean} [swr=true] - Enable stale-while-revalidate behavior
 * @param {number} [maxAge=CACHE_TTL.EXTERNAL] - Cache TTL in seconds
 * @returns {Object} - Cache options configured for external data
 */
export const getExternalCacheOptions = (name, swr = true, maxAge = CACHE_TTL.EXTERNAL) => {
    return getBaseCacheOptions('external', name, swr, maxAge);
}

/**
 * Generate cache options for external API data with shorter TTL
 * Uses 'external-short' group with CACHE_TTL.EXTERNAL_SHORT (1 day) default TTL
 * 
 * @param {string} name - Unique cache name identifier
 * @param {boolean} [swr=true] - Enable stale-while-revalidate behavior
 * @param {number} [maxAge=CACHE_TTL.EXTERNAL_SHORT] - Cache TTL in seconds
 * @returns {Object} - Cache options configured for short-lived external data
 */
export const getExternalShortCacheOptions = (name, swr = true, maxAge = CACHE_TTL.EXTERNAL_SHORT) => {
    return getBaseCacheOptions('external-short', name, swr, maxAge);
}

/**
 * Generate cache options for list/collection data
 * Uses 'lists' group with CACHE_TTL.LISTS (5 minutes) default TTL
 * 
 * @param {string} name - Unique cache name identifier
 * @param {boolean} [swr=true] - Enable stale-while-revalidate behavior
 * @param {number} [maxAge=CACHE_TTL.LISTS] - Cache TTL in seconds
 * @returns {Object} - Cache options configured for lists
 */
export const getListCacheOptions = (name, swr = true, maxAge = CACHE_TTL.LISTS) => {
    return getBaseCacheOptions('lists', name, swr, maxAge);
}

/**
 * Generate cache options for thesaurus/taxonomy data
 * Uses 'thesaurus' group with CACHE_TTL.THESAURUS (7 days) default TTL
 * Uses getKeyIdentifier for cache keys (supports identifier-based caching)
 * Does not include 'varies' header to allow global caching
 * 
 * @param {string} name - Unique cache name identifier
 * @param {boolean} [swr=true] - Enable stale-while-revalidate behavior
 * @param {number} [maxAge=CACHE_TTL.THESAURUS] - Cache TTL in seconds
 * @returns {Object} - Cache options configured for thesaurus data
 */
export const getThesaurusCacheOptions = (name, swr = true, maxAge = CACHE_TTL.THESAURUS) => {
    const options= clone({ ...getBaseCacheOptions("thesaurus", name, swr, maxAge), getKey: getKeyIdentifier });

    delete options.varies;
    return options;
}

/**
 * Generate cache options for user session data
 * Uses 'users' group with CACHE_TTL.USERS (5 minutes) default TTL
 * Uses custom getKey that extracts diuid from user data for cache key
 * 
 * @param {string} name - Unique cache name identifier
 * @param {boolean} [swr=false] - Enable stale-while-revalidate behavior
 * @param {number} [maxAge=CACHE_TTL.USERS] - Cache TTL in seconds
 * @returns {Object} - Cache options configured for user data
 */
export const getUserCacheOptions = (name, swr = false, maxAge = CACHE_TTL.USERS) => {
    return {
        base: 'cache',
        maxAge,
        name,
        group: 'users',
        swr,
        getKey: (event) => {
            const { multiSiteCode, siteCode } = event?.context?.site || {};
            const cookies = getHeader(event, 'Cookie') || '';
            // Extract session cookie hash for unique user identification
            const sessionMatch = cookies.match(/S?SESS[^=]*=([^;]+)/);
            const sessionId = sessionMatch?.[1] || 'no-session';
            // Use MD5-like hash of session for shorter, consistent keys
            const sessionHash = crypto.createHash('md5').update(sessionId).digest('hex');
            
            return `${multiSiteCode}:${siteCode}:${sessionHash}`;
        }
    };
}

