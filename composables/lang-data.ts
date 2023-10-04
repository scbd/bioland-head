

export const useLanguageMenus = async () => {
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost, gaiaApi, drupalMultisiteIdentifier }   = useRuntimeConfig().public;

    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/${siteIdentifier.value}/locales`

    const { data, error } = await useFetch(uri)

    return data.value
}

export const useSiteDefaultLocale = async () => {
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost, gaiaApi, drupalMultisiteIdentifier }   = useRuntimeConfig().public;

    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/${siteIdentifier.value}/default-locale`

    const { data, error } = await useFetch(uri)

    return data.value
}