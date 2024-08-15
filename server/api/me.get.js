export default defineEventHandler(async (event) => {
    try{

        const user = await getUser(event);

        
        return user
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get me me',
        }); 
    }
    
})
const anonUser = { userID: 1, name: 'anonymous', email: '@anonymous', isAuthenticated: false, roles: [] }

async function getUser(event) {

    const { host } = getContext(event);

    const uri           = `${host}/jsonapi`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json', Cookie: getHeader(event, 'Cookie')};//getHeader(event, 'Cookie')


    const {  meta:m } = await $fetch(uri, { method, headers });


    if(!m?.links?.me) return anonUser

    if(!m?.links?.me?.href) throw new Error('/api/me/getUser: no href property on ');

    const userUri = `${m.links.me.href}?include=roles`;
    const t= await $fetch(userUri, { method, headers });

    return  mapUserFromDrupal(t)
};

function hasSessionCookie(event){
    const cookies = parseCookies(event);

    const [hasDrupalSession] = Object.keys(cookies).filter(key => key.startsWith('SSESS'))|| [false];

    return hasDrupalSession;
}

function mapUserFromDrupal({ data, included }){
    const { id, attributes } = data;

    return {
        duuid          : id,
        diuid          : attributes?.drupal_internal__uid,
        preferredLang  : attributes?.preferred_langcode,
        displayName   : attributes?.display_name,
        name           : attributes?.name,
        email          : attributes?.mail,
        isAuthenticated: true,
        roles          : mapRolesFromDrupal(included)
    }
}

function mapRolesFromDrupal(included){
    return included.filter(({ type }) => type === 'user_role--user_role').map(({ attributes }) => (attributes?.drupal_internal__id))
}