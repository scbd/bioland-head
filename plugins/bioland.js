import { getBiolandSiteIdentifier } from "~/util";
import vClickOutside from "click-outside-vue3";

export default defineNuxtPlugin(async (nuxtApp) => {
    nuxtApp.vueApp.use(vClickOutside);

  
    const locale            = useState('locale', undefined );
    const siteIdentifier    = useState('siteIdentifier', undefined);
    const pagePath          = useState('pagePath', undefined);
    const siteDefaultLocale = useState('siteDefaultLocale', undefined);
    const footerMenu        = useState('footerMenu', undefined);
    const mainMenu          = useState('mainMenu', undefined);
    const footerCreditsMenu = useState('footerCreditsMenu', undefined);
    const languageMenus     = useState('languageMenus', undefined);

    const { hostname } = useRequestURL();

    locale.value = nuxtApp.$i18n.locale.value;
    siteIdentifier.value = getBiolandSiteIdentifier(hostname) || 'seed';
    siteDefaultLocale.value = await getSiteDefaultLocale();

    const allPromises = [];

    allPromises[0] = useFooterMenus().then((menus) => footerMenu.value = menus);
    allPromises[1] = useMainMenus().then((menus) => mainMenu.value = menus);
    allPromises[2] = useFooterCreditsMenus().then((menus) => footerCreditsMenu.value = menus);
    allPromises[3] = useLanguageMenus().then((menus) => languageMenus.value = menus);

    await Promise.all(allPromises);

    //middleware before every route change
    addRouteMiddleware('bioland-route-change',  async (to) => setAppStates(to), { global: true });

    async function setAppStates(to){
        pagePath.value = to.path;
    }


    async function getSiteDefaultLocale(){
        const siteIdentifier = useState('siteIdentifier');
        const { gaiaApi, drupalMultisiteIdentifier }   = useRuntimeConfig().public;
    
        const uri = `${gaiaApi}v2023/drupal/multisite/${drupalMultisiteIdentifier}/${siteIdentifier.value}/default-locale`
    
        const { data, error } = await useFetch(uri)
    
        return data.value
    }
});

