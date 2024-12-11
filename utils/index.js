import json5         from 'json5'                ;
import isPlainObject from 'lodash.isplainobject' ;

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

export function hasSessionCookie(){
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