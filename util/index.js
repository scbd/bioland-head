export const unLocales = ['en', 'ar', 'es', 'fr', 'ru', 'zh'];

export const getBiolandSiteIdentifier = (hostName) => {
    if(hostName.split('.').length <= 1)
        return undefined;

    return hostName.split('.')[0];
}

