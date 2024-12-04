const anonUser = { userID: 1, name: 'anonymous', email: '@anonymous', isAuthenticated: false, roles: [] }

export async function getUser(event, force = false) {
    try{
        const { me:meCookieString }= parseCookies(event, 'me') || {};

        const me = meCookieString? parseJson(decodeURIComponent(meCookieString)) : undefined;

        if(!force && me && me.isAuthenticated ) return me;

        const { localizedHost, siteCode, locale , locales, defaultLocale} = getContext(event);

        const { pathname } = new URL(getRequestURL(event))

        if(!siteCode ||  !isValidLocalePrefix({defaultLocale, locales, locale})) return anonUser;

        const uri           = `${localizedHost}/jsonapi`;
        const method        = 'get';
        const headers       = { 'Content-Type': 'application/json', Cookie: getHeader(event, 'Cookie') };//getHeader(event, 'Cookie')
   
        const {  meta:m } = await $fetch(uri, { method, headers });

        if(!m?.links?.me) return anonUser

        if(!m?.links?.me?.href) throw new Error('/api/me/getUser: no href property on ');

        const userUri = `${m.links.me.href}?include=roles`;
        const user    = await $fetch(userUri, { method, headers });
        const token   = await getToken(event);

        return  mapUserFromDrupal(user, token);
    }catch(e){
        console.error(e);

        return anonUser;
    }   
};
function isValidLocalePrefix({defaultLocale, locales, locale}){

    return locales.includes(locale) || locale === defaultLocale;
}
export async function getToken(event) {
    const { me:meCookieString } = parseCookies(event, 'me') || {};

    const me = meCookieString? JSON.parse(decodeURIComponent(meCookieString)) :{};

    if(me?.token) return me.token;

    if(!me.isAuthenticated) return '';

    const { localizedHost, siteCode } = getContext(event);

    if(!siteCode) return createError({ statusCode: 500, statusMessage: 'Server.drupal.user.getToken: no context derived' })
        
    const uri           = `${localizedHost}/session/token`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json', Cookie: getHeader(event, 'Cookie')};//getHeader(event, 'Cookie')

    const resp = await $fetch(uri, { method, headers });

    return resp
};


function hasSessionCookie(event){
    const cookies = parseCookies(event);

    const [hasDrupalSession] = Object.keys(cookies).filter(key => key.startsWith('SSESS'))|| [false];

    return hasDrupalSession;
}

function mapUserFromDrupal({ data, included }, token){
    const { id, attributes } = data;

    return {
        duuid          : id,
        diuid          : attributes?.drupal_internal__uid,
        preferredLang  : attributes?.preferred_langcode,
        displayName    : attributes?.display_name,
        name           : attributes?.name,
        email          : attributes?.mail,
        isAuthenticated: true,
        roles          : mapRolesFromDrupal(included),
        token
    }
}

function mapRolesFromDrupal(included=[]){
    return included.filter(({ type }) => type === 'user_role--user_role').map(({ attributes }) => (attributes?.drupal_internal__id))
}

