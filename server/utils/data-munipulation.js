
import isNill        from 'lodash.isnil'         ;

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

export { parseJson, uniqueArrayOfObjects, uniqueArray } from '~/utils/index';
