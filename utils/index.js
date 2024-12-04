import json5         from 'json5'                ;
import isPlainObject from 'lodash.isplainobject' ;

export function parseJson(dataString){
    try {
        if(isPlainObject(dataString))   return dataString;

        return json5.parse(dataString);
    }catch(e){
        return undefined;
    }
}

export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];
