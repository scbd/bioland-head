import {  useSiteStore } from "~/stores/site";

export const useLanguageMenus = async () => {
    const { identifier, gaiaApi, drupalMultisiteIdentifier } = useSiteStore()

    const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/configs/${identifier}/locales`

    const data = await $fetch(uri)

    return data || []
}