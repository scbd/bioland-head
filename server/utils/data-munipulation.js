
import isNill        from 'lodash.isnil'         ;

export function removeNullPropsFromPlainObject(obj){
    for (const key in obj)
        if(isNill(obj[key])) delete obj[key];

    return obj;
}



export { parseJson, uniqueArrayOfObjects, uniqueArray, sortArrayOfObjectsByProp } from '~/utils/index';

