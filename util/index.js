export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];



export     function getGbfUrl(identifier){
    const number = Number(identifier.replace('GBF-TARGET-', ''));

    return `https://www.cbd.int/gbf/targets/${number}`
}