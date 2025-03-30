const anonUser = { userID: 1, name: 'anonymous', email: '@anonymous', isAuthenticated: false, roles: [] }

export const getUser = async (event, repo) => {

    try{
        const { localizedHost, env, siteCode, locale , multiSiteCode, locales, defaultLocale} = getContext(event);

        if(!siteCode ||  !isValidLocalePrefix({defaultLocale, locales, locale})) return anonUser;

        const $http = await useDrupalLogin(siteCode);

        const uri           = `${localizedHost}/jsonapi`;
        const method        = 'get';
        const headers       = { 'Content-Type': 'application/json', Cookie: getHeader(event, 'Cookie')  };//getHeader(event, 'Cookie')


        const {  meta:m } = await $fetch(uri, { method, headers });

        if(!m?.links?.me) return anonUser

        if(!m?.links?.me?.href) throw new Error('/api/me/getUser: no href property on ');

        const userUri = `${m.links.me.href}?include=roles,user_picture`;


        const { body:user}  = await $http.get(userUri);
        const   token       = await getToken(event);


        return  mapUserFromDrupal(user, token, event);
    }catch(e){
        console.error(e);

        return anonUser;
    }   
}

  function getKeyUser(event){
    const { localizedHost, env, siteCode, locale , multiSiteCode, locales, defaultLocale} = getContext(event);

    return`${env}-${siteCode}-${locale}-${multiSiteCode}-${localizedHost}`;
  }
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




function mapUserFromDrupal({ data, included }, token, event){
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
        img:getImg(event, included),
        token
    }
}

function getImg(event, included=[]){
    const { host, siteCode } = getContext(event);
    const imgData = included.find(({ type }) => type === 'file--file');

    if(!imgData) return;

    const { attributes } = imgData;

    return { ...attributes, src: host+attributes?.uri?.url }

}
function mapRolesFromDrupal(included=[]){
    return included.filter(({ type }) => type === 'user_role--user_role').map(({ attributes }) => (attributes?.drupal_internal__id))
}

