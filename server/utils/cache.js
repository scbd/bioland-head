import crypto from 'crypto';

export const getKey =  (event) => {
    const { context }  = parseCookies(event)
    const   query      = getQuery(event)
    const { pathname } = new URL(getRequestURL(event))

    const locale   = query?.locale || context?.locale || 'und'
    const host     = query?.host || context?.host 
    const makeHash = (x) => crypto.createHash('sha1').update(x).digest('hex')
    const hashData = `${host}-${locale}-${pathname}` + JSON.stringify({...context, ...query});

    return `${host}-${locale}-${pathname}-${makeHash(hashData)}`
}

export const shouldInvalidateCache = (event) => {
    return false;
}

export const shouldBypassCache = (event) => {
    return false;   
}