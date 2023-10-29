import * as changeKeys from "change-case/keys";

export const drupalLangs = [ "af", "am", "ar", "ast", "az", "be", "bg", "bn", "bo", "bs", "ca", "cs", "cy", "da", "de", "dz", "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fil", "fo", "fr", "fy", "ga", "gd", "gl", "gsw-berne", "gu", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jv", "ka", "kk", "km", "kn", "ko", "ku", "ky", "lo", "lt", "lv", "mg", "mk", "ml", "mn", "mr", "ms", "my", "ne", "nl", "nb", "nn", "oc", "pa", "pl", "pt-pt", "pt-br", "ro", "ru", "sco", "se", "si", "sk", "sl", "sq", "sr", "sv", "sw", "ta", "ta-lk", "te", "th", "tr", "tyv", "ug", "uk", "ur", "vi", "zh-hans", "zh-hant" ]
export const rtl         = [ "am", "ar","az", "he", "fa", "ur", 'mv', 'ku' ]

export const getInstalledLanguages = async ({ identifier, pathPreFix }) => {
    const { baseHost } = useRuntimeConfig().public;
    const   pathLocale = pathPreFix === '/zh'? '/zh-hans' : pathPreFix;

    const $http = await useDrupalLogin(identifier);

    const uri  = `https://${identifier}${baseHost}${pathLocale}/jsonapi/configurable_language/configurable_language`;

    const { body: { data } } = await $http.get(uri);

    return normalizeLanguageData(data);
}

export const getDefaultLocale= async ({ identifier, pathPreFix } = { pathPreFix : ''}) => {

    const [aLang] = await  getInstalledLanguages({ identifier, pathPreFix })

    return { locale: aLang };
}

export const normalizeDrupalJsonApiData = (data=[]) => {
    return data.map((aData)=> changeKeys.camelCase(aData))
}

export const normalizeLanguageData = (data=[]) => {
    return normalizeDrupalJsonApiData(data)
                        .filter((lang)=> getLanguage(lang.drupalInternalId))
                        .map((lang)=> ({...lang, ...getLanguage(lang.drupalInternalId)}))
                        .sort((a,b)=> sort(a,b, 'weight'))
}

export const getLanguage = (locale) => {
    const { locales } = useRuntimeConfig().public;

    return locales.find((language) => {
        return language.code.startsWith(locale.substring(0, 2));
    });
}
function sort(a,b, prop){
    if(a[prop] < b[prop]) return -1; 
    if(a[prop] > b[prop]) return 1;

    return 0;
}
