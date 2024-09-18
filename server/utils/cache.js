import crypto from 'crypto';

export const getKey =  (event) => {
    const { pathname } = new URL(getRequestURL(event))
    const   ctx        = getContext(event);
    const query = getQuery(event)
    const { key:k, locale, siteCode , multiSiteCode, env } = ctx;

    const key = k? k.replaceAll('context-', '')+`-${pathname}` : `${env}-${multiSiteCode}-${siteCode}-${locale}-${pathname}`;

    const makeHash = (x) => crypto.createHash('sha1').update(x).digest('hex')
    const hashData = key + JSON.stringify(ctx)+JSON.stringify(query || {});


    const hashedKey = `${key}-${makeHash(hashData)}`;

    event.node.res.setHeader('c-key', hashedKey.replaceAll('/', '').replaceAll('-', ''))

    return hashedKey
}

export const shouldInvalidateCache = async (event) => {
    const key = getHeader(event, 'Clear-Cache')

    if(!key) return false;

    await useStorage('db').removeItem(`nitro:handlers:_:${key}.json`, true);

    return true;
}

export const shouldBypassCache = async (event) => {

    const key = getHeader(event, 'No-Cache')

    if(!key || key === 'undefined') return false;

    const exists = await useStorage('db').getItem(`nitro:handlers:_:${key}.json`)

    useStorage('db').removeItem(`nitro:handlers:_:${key}.json`, true);

    return exists? key : false;   
}