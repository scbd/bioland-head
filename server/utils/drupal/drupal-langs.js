import * as changeKeys from "change-case/keys";

export const drupalLangs = [ "af", "am", "ar", "ast", "az", "be", "bg", "bn", "bo", "bs", "ca", "cs", "cy", "da", "de", "dz", "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fil", "fo", "fr", "fy", "ga", "gd", "gl", "gsw-berne", "gu", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jv", "ka", "kk", "km", "kn", "ko", "ku", "ky", "lo", "lt", "lv", "mg", "mk", "ml", "mn", "mr", "ms", "my", "ne", "nl", "nb", "nn", "oc", "pa", "pl", "pt-pt", "pt-br", "ro", "ru", "sco", "se", "si", "sk", "sl", "sq", "sr", "sv", "sw", "ta", "ta-lk", "te", "th", "tr", "tyv", "ug", "uk", "ur", "vi", "zh-hans", "zh-hant" ]
export const rtl         = [ "am", "ar","az", "he", "fa", "ur", 'mv', 'ku' ]

export const getInstalledLanguages = async ({ localizedHost, host, siteCode }) => {

    const $http = await useDrupalLogin(siteCode);

    const uri  = `${host}/jsonapi/configurable_language/configurable_language`;

    const { body: { data } } = await $http.get(uri).query({ 'jsonapi_include': 1 });

    return normalizeLanguageData(data);
}

export const getDefaultLocale= async (query) => {

    const { baseHost, env }  = useRuntimeConfig().public;
    const   hasRedirect     = env === 'production' && query?.config?.redirect;
    const   host            = hasRedirect? `https://${query.config.redirect}` : `https://${query.siteCode}.${baseHost}`;
    const [aLang]           = await  getInstalledLanguages({ ...query, host });

    return { locale: aLang?.langcode };
}

export const normalizeDrupalJsonApiData = (data=[]) => {
    return data.map((aData)=> changeKeys.camelCase(aData))
}

export const normalizeLanguageData = (data=[]) => {
    return normalizeDrupalJsonApiData(data)
                        .filter((lang)=> getLanguage(lang.drupalInternalId))
                        .map((lang)=> ({...lang, ...getLanguage(lang.drupalInternalId)}))
                        .sort((a,b)=> sortArrayOfObjectsByProp(a,b, 'weight'))
}

export const getLanguage = (locale) => {
    const { locales } = useRuntimeConfig().public;

    return locales.find((language) => {
        return language.code.startsWith(locale.substring(0, 2));
    });
}

export function mapDrupalLocaleToLocale({ drupalInternalId }){
    if(drupalInternalId === 'zh-hans') return 'zh'

    return drupalInternalId
}
