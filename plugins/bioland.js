import { getBiolandSiteIdentifier } from "~/util";
import {  useSiteStore } from "~/stores/site";
import {  useMenusStore } from "~/stores/menus";

import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    nuxtApp.vueApp.use(vClickOutside);
    const { gaiaApi, drupalMultisiteIdentifier, baseHost }   = useRuntimeConfig().public;
    const siteStore = useSiteStore(nuxtApp.$pinia);
    const menuStore = useMenusStore(nuxtApp.$pinia);
    const { hostname } = useRequestURL();

    siteStore.set('baseHost',baseHost);
    siteStore.set('gaiaApi',gaiaApi);
    siteStore.set('drupalMultisiteIdentifier',drupalMultisiteIdentifier);
    siteStore.set('locale',nuxtApp.$i18n.locale);
    siteStore.set('identifier',getBiolandSiteIdentifier(hostname) || 'seed');
    siteStore.set('defaultLocale',await getSiteDefaultLocale());


    // // const locale            = useState('locale', undefined );
    // // const siteIdentifier    = useState('siteIdentifier', undefined);
    // // const pagePath          = useState('pagePath', undefined);
    // // const siteDefaultLocale = useState('siteDefaultLocale', undefined);
    // const footerMenu        = useState('footerMenu', undefined);
    // const mainMenu          = useState('mainMenu', undefined);
    // const footerCreditsMenu = useState('footerCreditsMenu', undefined);
    // const languageMenus     = useState('languageMenus', undefined);
    // const pageData          = useState('pageData', undefined);
    // const hasHeroImage      = useState('hasHeroImage', undefined);

    


    // siteDefaultLocale.value = await getSiteDefaultLocale();

    const allPromises = [];

    allPromises[0] = useFooterMenus().then((menus) => menuStore.set('footer', menus) );
    allPromises[1] = useMainMenus().then((menus) => menuStore.set('main', menus));
    allPromises[2] = useFooterCreditsMenus().then((menus) => {
        consola.warn('footerCredits',menus)
        menuStore.set('footerCredits', menus);});
    allPromises[3] = useLanguageMenus().then((menus) => menuStore.set('languages', menus));


    await Promise.all(allPromises);

    consola.warn('menuStore',menuStore)
    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    async function setAppStates(to){
        siteStore.set('pagePath',to.path);
        // pagePath.value = to.path;
        
        // consola.info('pagePath',to.path)
        // const { uuid, id, type, bundle } = await usePageIdentifiers(pagePath);
        // //  getPageData({ uuid, id, type, bundle });
        // consola.info('usePageIdentifiers',{ uuid, id, type, bundle } )

        // hasHeroImage.value = await useHasHeroImage(pagePath);
    }


    async function getSiteDefaultLocale(){
        const { identifier, gaiaApi, drupalMultisiteIdentifier } = siteStore;

    
        const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/${identifier}/default-locale`
    
        const { data, error } = await useFetch(uri)
    
        return data.value
    }
});

