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
