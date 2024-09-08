import crypto from 'crypto';

export const getKey =  (event) => {
    const { pathname } = new URL(getRequestURL(event))
    const   ctx        = getContext(event);

    const { key:k, locale, siteCode , multiSiteCode, env } = ctx;

    const key = k? k.replaceAll('context-', '')+`-${pathname}` : `${env}-${multiSiteCode}-${siteCode}-${locale}-${pathname}`;

    const makeHash = (x) => crypto.createHash('sha1').update(x).digest('hex')
    const hashData = key + JSON.stringify(ctx);

    return `${key}-${makeHash(hashData)}`
}

export const shouldInvalidateCache = (event) => {
    return false;
}

export const shouldBypassCache = (event) => {
    return false;   
}