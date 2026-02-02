/**
 * Default anonymous user object returned when no authenticated session exists
 * @type {{userID: number, name: string, email: string, isAuthenticated: boolean, roles: Array}}
 */
const anonUser = { userID: 1, name: 'anonymous', email: '@anonymous', isAuthenticated: false, roles: [] }

/**
 * Internal uncached user fetcher - retrieves user data from Drupal JSON:API
 * 
 * Performs the following steps:
 * 1. Validates request context (siteCode, locale)
 * 2. Authenticates with Drupal using site credentials
 * 3. Fetches JSON:API root to discover user endpoint via `meta.links.me`
 * 4. Retrieves full user data including roles and profile picture
 * 5. Maps Drupal user structure to application user format
 * 
 * @private
 * @async
 * @param {H3Event} event - The H3 event object from the incoming request
 * @returns {Promise<Object>} User object with authentication details, or anonUser if not authenticated
 * @returns {string} return.duuid - Drupal user UUID
 * @returns {number} return.diuid - Drupal internal user ID
 * @returns {string} return.preferredLang - User's preferred language code
 * @returns {string} return.displayName - User's display name
 * @returns {string} return.name - User's account name
 * @returns {string} return.timezone - User's timezone
 * @returns {string} return.email - User's email address
 * @returns {boolean} return.isAuthenticated - Always true for authenticated users
 * @returns {Array<string>} return.roles - Array of Drupal role IDs
 * @returns {Object} [return.img] - User profile image data with src URL
 * @returns {string} return.token - CSRF token for subsequent requests
 */
async function _getUser(event) {

    try{
        const { localizedHost, env, siteCode, locale , multiSiteCode, locales, defaultLocale} = await useRequestContext(event);

        if(!siteCode ||  !isValidLocalePrefix({defaultLocale, locales, locale})) return anonUser;

        const $http = await useDrupalLogin(siteCode);

        const uri           = `${localizedHost}/jsonapi`;
        const method        = 'get';
        const headers       = { 'Content-Type': 'application/json', Cookie: getHeader(event, 'Cookie')  };//getHeader(event, 'Cookie')

        const {  meta:m } = await $fetch(uri, $fetchBaseOptions({ method, headers }));

        // Debug: log the full meta structure
        // consola.warn('Full meta object:', JSON.stringify(m, null, 2));

        if(!m?.links?.me) return anonUser

        if(!m?.links?.me?.href) {
            console.error('/api/me/getUser: no href property on m.links.me:', JSON.stringify(m?.links?.me, null, 2));
            return anonUser;
        }

        const   userUri     = `${m.links.me.href}?include=roles,user_picture`;
        const { body:user}  = await $http.get(userUri);
        const   token       = await getToken(event);

        return  mapUserFromDrupal(user, token, event);
    }catch(e){
        console.error(e);

        return anonUser;
    }   
}

/**
 * Cached user fetcher using Nitro's defineCachedFunction
 * 
 * Wraps `_getUser` with caching to avoid repeated Drupal API calls for the same session.
 * Cache key is derived from the session cookie, ensuring each user gets their own cached data.
 * 
 * **Important:** Only authenticated users are cached. Anonymous users bypass this entirely
 * via the `getUser` wrapper to avoid caching the same anonUser object repeatedly.
 * 
 * **Note:** Cannot use `shouldBypassAndInvalidateCache` here due to circular dependency -
 * that function checks `event.context.me` which is set AFTER `getUser` is called.
 * 
 * @private
 * @type {function(H3Event): Promise<Object>}
 * @see _getUser - The underlying uncached implementation
 * @see getUserCacheOptions - Cache configuration (TTL, key generation)
 */
const _getCachedUser = defineCachedFunction(
  async (event) => {
    return await _getUser(event);
  },
  getUserCacheOptions('get-cached-user')
);

/**
 * Get the current user from Drupal based on session cookie
 * 
 * This is the main entry point for user retrieval. It implements an optimization
 * pattern that immediately returns the anonymous user if no Drupal session cookie
 * is present, avoiding unnecessary API calls and cache lookups.
 * 
 * Session cookie detection:
 * - `SSESS*` - Secure session cookie (HTTPS)
 * - `SESS*` - Standard session cookie (HTTP)
 * 
 * @async
 * @param {H3Event} event - The H3 event object from the incoming request
 * @returns {Promise<Object>} User object - either authenticated user data or anonUser
 * @example
 * // In a server route or middleware:
 * export default defineEventHandler(async (event) => {
 *   const user = await getUser(event);
 *   if (!user.isAuthenticated) {
 *     throw createError({ statusCode: 401, message: 'Unauthorized' });
 *   }
 *   return { user };
 * });
 */
export const getUser = async (event) => {
  const cookies = getHeader(event, 'Cookie') || '';
  // Check for Drupal session cookie (SSESS or SESS)
  const hasSession = /S?SESS[^=]*=/.test(cookies);
  
  // No session = anonymous user (skip cache and DB calls)
  if (!hasSession) return anonUser;

  // Has session = fetch and cache
  return await _getCachedUser(event);
};


/**
 * Validates that a locale is either in the allowed locales list or is the default locale
 * 
 * Used to prevent API calls with invalid locale prefixes that would result in 404s
 * or unexpected behavior from Drupal.
 * 
 * @private
 * @param {Object} options - Validation options
 * @param {string} options.defaultLocale - The site's default locale (e.g., 'en')
 * @param {Array<string>} options.locales - Array of valid locale codes for this site
 * @param {string} options.locale - The locale to validate
 * @returns {boolean} True if locale is valid, false otherwise
 * @example
 * isValidLocalePrefix({ defaultLocale: 'en', locales: ['en', 'fr', 'es'], locale: 'fr' }); // true
 * isValidLocalePrefix({ defaultLocale: 'en', locales: ['en', 'fr', 'es'], locale: 'de' }); // false
 */
function isValidLocalePrefix({defaultLocale, locales, locale}){

    return locales.includes(locale) || locale === defaultLocale;
}

/**
 * Retrieves the CSRF token for authenticated Drupal requests
 * 
 * The token is required for any mutating operations (POST, PATCH, DELETE) against
 * Drupal's JSON:API. This function first checks if the token is cached in the `me`
 * cookie, and if not, fetches a fresh token from Drupal's session/token endpoint.
 * 
 * Token retrieval priority:
 * 1. Return cached token from `me` cookie if present
 * 2. Return empty string if user is not authenticated
 * 3. Fetch fresh token from Drupal `/session/token` endpoint
 * 
 * @async
 * @param {H3Event} event - The H3 event object from the incoming request
 * @returns {Promise<string>} CSRF token string, or empty string for anonymous users
 * @throws {H3Error} 500 error if siteCode cannot be derived from context
 * @example
 * const token = await getToken(event);
 * await $fetch(drupalUrl, {
 *   method: 'POST',
 *   headers: { 'X-CSRF-Token': token }
 * });
 */
export async function getToken(event) {
    const { me:meCookieString } = parseCookies(event, 'me') || {};

    const me = meCookieString? JSON.parse(decodeURIComponent(meCookieString)) :{};

    if(me?.token) return me.token;

    if(!me.isAuthenticated) return '';

    const { localizedHost, siteCode } = await useRequestContext(event);

    if(!siteCode) return createError({ statusCode: 500, statusMessage: 'Server.drupal.user.getToken: no context derived' })
        
    const uri           = `${localizedHost}/session/token`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json', Cookie: getHeader(event, 'Cookie')};//getHeader(event, 'Cookie')

    const resp = await $fetch(uri, $fetchBaseOptions({ method, headers }));

    return resp
};




/**
 * Maps Drupal JSON:API user response to application user format
 * 
 * Transforms the Drupal user entity structure (with `data` and `included` arrays)
 * into a flat, camelCase user object suitable for the application.
 * 
 * @private
 * @async
 * @param {Object} drupalResponse - The JSON:API response from Drupal
 * @param {Object} drupalResponse.data - Primary user entity data
 * @param {string} drupalResponse.data.id - User UUID
 * @param {Object} drupalResponse.data.attributes - User attribute fields
 * @param {Array<Object>} drupalResponse.included - Related entities (roles, user_picture)
 * @param {string} token - CSRF token for the user session
 * @param {H3Event} event - The H3 event object (needed for host URL in image)
 * @returns {Promise<Object>} Mapped user object with standardized properties
 */
async function mapUserFromDrupal({ data, included }, token, event){
    const { id, attributes } = data;
    const   img = await getImg(event, included);
    return {
        duuid          : id,
        diuid          : attributes?.drupal_internal__uid,
        preferredLang  : attributes?.preferred_langcode,
        displayName    : attributes?.display_name,
        name           : attributes?.name,
        timezone       : attributes?.timezone,
        email          : attributes?.mail,
        isAuthenticated: true,
        roles          : mapRolesFromDrupal(included),
        img ,
        token
    }
}

/**
 * Extracts and formats user profile image from Drupal included entities
 * 
 * Searches the JSON:API `included` array for a `file--file` entity (the user's
 * profile picture) and constructs a full URL by prepending the site host.
 * 
 * @private
 * @async
 * @param {H3Event} event - The H3 event object (needed to derive host URL)
 * @param {Array<Object>} [included=[]] - JSON:API included entities array
 * @returns {Promise<Object|undefined>} Image object with Drupal file attributes plus `src` URL,
 *                                       or undefined if no profile picture exists
 * @returns {string} return.src - Full URL to the image file
 * @returns {Object} return.uri - Drupal URI object with url property
 * @returns {string} return.filename - Original filename
 * @returns {string} return.filemime - MIME type (e.g., 'image/jpeg')
 */
async function getImg(event, included=[]){
    const { host, siteCode } = await useRequestContext(event);
    const imgData = included.find(({ type }) => type === 'file--file');

    if(!imgData) return;

    const { attributes } = imgData;

    return { ...attributes, src: host+attributes?.uri?.url }

}
/**
 * Extracts user role IDs from Drupal included entities
 * 
 * Filters the JSON:API `included` array for `user_role--user_role` entities
 * and extracts the internal Drupal role ID from each (e.g., 'administrator',
 * 'content_editor', 'authenticated').
 * 
 * @private
 * @param {Array<Object>} [included=[]] - JSON:API included entities array
 * @returns {Array<string>} Array of Drupal role machine names
 * @example
 * // With included array containing role entities:
 * mapRolesFromDrupal(included);
 * // Returns: ['authenticated', 'content_editor', 'administrator']
 */
function mapRolesFromDrupal(included=[]){
    return included.filter(({ type }) => type === 'user_role--user_role').map(({ attributes }) => (attributes?.drupal_internal__id))
}

