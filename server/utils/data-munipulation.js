import isPlainObject from 'lodash.isplainobject' ;
import isNill        from 'lodash.isnil'         ;
import json5         from 'json5'                ;

export function uniqueObjects(passedArray){
    const setOfStrings = new Set(passedArray.map(e => json5.stringify(e)));

    return Array.from(setOfStrings).map(e => json5.parse(e));
}

export function removeNullPropsFromPlainObject(obj){
    for (const key in obj)
        if(isNill(obj[key])) delete obj[key];

    return obj;
}

export function sortArrayOfObjectsByProp(a,b, prop){
    if(a[prop] < b[prop]) return -1; 
    if(a[prop] > b[prop]) return 1;

    return 0;
}

export function parseJson(dataString){
    try {
        if(isPlainObject(dataString))   return dataString;

        return json5.parse(dataString);
    }catch(e){
        return undefined;
    }
}