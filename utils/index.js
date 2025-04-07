import json5         from 'json5'                ;
import isPlainObject from 'lodash.isplainobject' ;
import { parse as parseUrl, format as formatUrl } from 'native-url'

export function uniqueArrayOfObjects(passedArray){
    const setOfStrings = new Set(passedArray.map(e => json5.stringify(e)));

    return Array.from(setOfStrings).map(e => json5.parse(e));
}

export function uniqueArray(passedArray){
    const setOfStrings = new Set(passedArray);

    return Array.from(setOfStrings);
}

export const falsyFilter = x => x && x !== 'undefined' && x !== 'null';

export function parseJson(dataString){
    try {
        if(isPlainObject(dataString))   return dataString;

        return json5.parse(dataString);
    }catch(e){
        return undefined;
    }
}

export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];

export function debounce(fn, wait){
    let timer;
    return function(...args){
        if(timer) {
            clearTimeout(timer); // clear any pre-existing timer
        }
        const context = this; // get the current context
        timer = setTimeout(()=>{
            fn.apply(context, args); // call the function if time expires
        }, wait);
    }
}

export function randomArrayIndexTimeBased(total = 3){
    const minutes = new Date().getMinutes();

    for(let i = 0; i < total; i++)
        if(minutes <= ((60/total) * i+1)) return i;

    return 0
}

export const randomTime = randomArrayIndexTimeBased;

export  function getGbfUrl(identifier){
    const number = Number(identifier.replace('GBF-TARGET-', ''));

    return `https://www.cbd.int/gbf/targets/${number}`
}

export function hasSessionCookieClient(){
    if(process.server) return false;
    
    const cookies = document.cookie.split(';');

    for (let cookie of cookies) {
        const [key] = cookie.trim().split('=');

        if (!key.startsWith('SSESS')) continue;
        
        return key;
    }

    return null;
}
export function sortArrayOfObjectsByProp(a,b, prop, direction = 'asc'){
    const isAsc = direction === 'asc';

    if(a[prop] < b[prop]) return isAsc? 1 : -1; 
    if(a[prop] > b[prop]) return isAsc? -1 : 1; 

    return 0;
}

export const mapLocaleToDrupal = (locale) => {
    if (locale === 'zh') return 'zh-hans';
    if (locale === 'tl') return 'fil';

    return locale
}
  
export const mapLocaleFromDrupal = (locale) => {
    if (locale === 'zh-hans') return 'zh';
    if (locale === 'fil') return 'tl';

    return locale
}


export function truncateUrl(urlString, length) {
	if (typeof urlString !== 'string') {
		throw new TypeError('Expected input to be a string');
	}

	if (typeof length !== 'number') {
		throw new TypeError('Expected length to be a number');
	}

	if (urlString.length <= length) {
		return urlString;
	}

	const TRUNCATE_SYMBOL_LENGTH = 2;
	const parsed = parseUrl(urlString);
	let remainingLength = length - (urlString.length - parsed.path.length) - TRUNCATE_SYMBOL_LENGTH;
	const pathParts = parsed.path.split('/');
	const pathPartsReturnValue = [];
	let index = pathParts.length;

	while (index--) {
		const x = pathParts[index];

		if (remainingLength < x.length + 1) {
			pathPartsReturnValue.push('…');
			break;
		}

		pathPartsReturnValue.push(x);
		remainingLength -= x.length + 1;
	}

	parsed.pathname = pathPartsReturnValue.reverse().join('/');

	return formatUrl(parsed);
}

export async function $fetchRetry(url, options) {
    const MAX_NB_RETRY = 10;
    const RETRY_DELAY_MS = 2000;

    let retryLeft = MAX_NB_RETRY;
    while (retryLeft > 0){
        try {
            return await $fetch(url, options);
        }
        catch (err) { 
            await sleep(RETRY_DELAY_MS)
        }
        finally {
            retryLeft -= 1;
        }
    }
    throw new Error(`Too many retries`);
}

function sleep(delay=200){
    return new Promise((resolve) => setTimeout(resolve, delay));
}
