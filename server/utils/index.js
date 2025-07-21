import { createConsola } from "consola";

import limax from 'limax';
import anyAscii from 'any-ascii';


export { unLocales, mapLocaleToDrupal, mapLocaleFromDrupal } from '~/utils/index';
export { htmlSanitize } from '~/utils/html';
export const consola = createConsola({ level: 5, fancy: true });

export function isOddNumber(num) { return num % 2;}

export function passError(event, error){
    const { siteCode, locale } = getContext(event);
    const   requestUrl         = new URL(getRequestURL(event));
    const { pathname, host }   = requestUrl;
    const { baseHost, env }    = useRuntimeConfig().public;

    console.error(`${host}${pathname}.js`,error);

    throw createError({
        statusCode    : error.statusCode,
        statusMessage : error.statusMessage,
        message       : `${host}${pathname}.js`,
        data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:error.data }
    }); 
}

export const slugify = (str) => {
    if(!str) return '';

    return limax(anyAscii(str));
}