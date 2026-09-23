
import limax from 'limax';
import anyAscii from 'any-ascii';

// NOTE: Do NOT re-export locale functions here - they are exported from translate/locale.js
// Re-exporting causes "Duplicated imports" warnings during build
export { unLocales } from '~/utils/index';
export { htmlSanitize } from '~/utils/html';


export function isOddNumber(num) { return num % 2;}

export async function passError(event, error){
    const { siteCode, locale } = await useRequestContext(event).catch(() => ({ siteCode: 'unknown', locale: 'en' }));
    const   requestUrl         = new URL(getRequestURL(event));
    const { pathname, host }   = requestUrl;
    const { baseHost, env }    = useRuntimeConfig().public;

    // One line: the raw error carries upstream URLs (with any api-key) and, for Drupal, a
    // full HTML page in `data`, which also must not travel back to the client.
    consola.error(`${host}${pathname}.js`, describeError(error));

    throw createError({
        statusCode    : error.statusCode,
        statusMessage : error.statusMessage,
        message       : `${host}${pathname}.js`,
        data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl: redactUrl(requestUrl) }
    });
}

export const slugify = (str) => {
    if(!str) return '';

    return limax(anyAscii(str));
}