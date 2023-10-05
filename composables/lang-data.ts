

export const useLanguageMenus = async () => {
    const siteIdentifier = useState('siteIdentifier');
    const { gaiaApi, drupalMultisiteIdentifier }   = useRuntimeConfig().public;

    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/${siteIdentifier.value}/locales`

    const { data, error } = await useFetch(uri)

    return data.value
}