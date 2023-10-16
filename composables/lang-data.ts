import {  useSiteStore } from "~/stores/site";

export const useLanguageMenus = async () => {
    const { identifier, gaiaApi, drupalMultisiteIdentifier } = useSiteStore()

    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/${identifier}/locales`

    const { data, error } = await useFetch(uri)

    return data.value
}