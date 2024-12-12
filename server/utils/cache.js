import crypto from 'crypto';

export const getKey =  (event) => {
    const { pathname } = new URL(getRequestURL(event))
    const   ctx        = getContext(event);
    const   query      = getQuery(event);

    const { key:k, locale, siteCode , multiSiteCode, env } = ctx;

    const key = k? k.replaceAll('context-', '')+`-${pathname}` : `${env}-${multiSiteCode}-${siteCode}-${locale}-${pathname}`;

    const makeHash = (x) => crypto.createHash('sha1').update(x).digest('hex');
    const hashData = key + JSON.stringify(ctx)+JSON.stringify(query || {});

    const hashedKey = `${key}-${makeHash(hashData)}`;

    event.node.res.setHeader('c-key', hashedKey.replaceAll('/', '').replaceAll('-', ''));

    return hashedKey
}

export const shouldInvalidateCache = async (event, storageName='db') => {
    const clearAll = getHeader(event, 'Clear-All-Cache');
    const key      = getHeader(event, 'Clear-Cache')? getKey (event) : '';

    if(clearAll) {
        useStorage(storageName).clear();

        return true;
    }
    if(!key) return false;

    await useStorage(storageName).removeItem(`nitro:handlers:_:${key}.json`, true);

    return true;
}

const shouldInvalidateCacheComments   = async (event) => shouldInvalidateCache(event, 'comments');
const shouldInvalidateCachePages      = async (event) => shouldInvalidateCache(event, 'pages');
const shouldInvalidateCacheContext    = async (event) => shouldInvalidateCache(event, 'context');
const shouldInvalidateCacheForums     = async (event) => shouldInvalidateCache(event, 'forums');
const shouldInvalidateCacheLists      = async (event) => shouldInvalidateCache(event, 'lists');
const shouldInvalidateCacheExternal   = async (event) => shouldInvalidateCache(event, 'external');
const shouldInvalidateCacheMenus      = async (event) => shouldInvalidateCache(event, 'menus');

export const shouldBypassCache = async (event, storageName='db') => {

    const key = getHeader(event, 'No-Cache');

    if(!key || key === 'undefined') return false;

    const exists = await useStorage(storageName).getItem(`nitro:handlers:_:${key}.json`);

    useStorage(storageName).removeItem(`nitro:handlers:_:${key}.json`, true);

    return exists? key : false;   
}

const shouldBypassCacheComments  = async (event) => shouldBypassCache(event, 'comments');
const shouldBypassCachePages     = async (event) => shouldBypassCache(event, 'pages');
const shouldBypassCacheContext   = async (event) => shouldBypassCache(event, 'context');
const shouldBypassCacheForums    = async (event) => shouldBypassCache(event, 'forums');
const shouldBypassCacheLists     = async (event) => shouldBypassCache(event, 'lists');
const shouldBypassCacheExternal  = async (event) => shouldBypassCache(event, 'external');
const shouldBypassCacheMenus     = async (event) => shouldBypassCache(event, 'menus');

export const commentCache = { 
    maxAge: 60 * 60 * 60 * 24,
    getKey,
    base:'comments',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache:shouldBypassCacheComments,
    shouldInvalidateCache:shouldInvalidateCacheComments
}

export const pageCache = { 
    maxAge: 60 * 60 * 60 * 24 * 30,
    getKey,
    base:'pages',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache:shouldBypassCachePages,
    shouldInvalidateCache:shouldInvalidateCachePages
}

export const contextCache = { 
    maxAge: 60 * 60 * 60 * 24 * 30,
    getKey,
    base:'context',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache    :shouldBypassCacheContext,
    shouldInvalidateCache:shouldInvalidateCacheContext
}

export const forumsCache = { 
    maxAge: 60 * 60 * 60,
    getKey,
    base:'forums',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache    :shouldBypassCacheForums,
    shouldInvalidateCache:shouldInvalidateCacheForums
}

export const listCache = { 
    maxAge: 60 * 60 * 60,
    getKey,
    base:'lists',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache    :shouldBypassCacheLists,
    shouldInvalidateCache:shouldInvalidateCacheLists
}
export const externalCache = { 
    maxAge: 60 * 60 * 60 * 24 * 30 * 6,
    getKey,
    base:'external',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache    :shouldBypassCacheExternal,
    shouldInvalidateCache:shouldInvalidateCacheExternal
}

export const menusCache = { 
    maxAge: 60 * 60 * 60 * 24 * 30,
    getKey,
    base:'menus',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache    :shouldBypassCacheMenus,
    shouldInvalidateCache:shouldInvalidateCacheMenus
}