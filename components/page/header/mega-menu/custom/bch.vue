<template>
    <div class="col-12 text-wrap px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />
        <PageHeaderMegaMenuLink v-for="(aMenu,j) in menu.children" :key="j" :menu="aMenu" />
    </div>
</template>
<script>
    // import { unLocales } from "~/util";
    // import { useSiteStore } from "~/stores/site";
    // import { useMenusStore } from "~/stores/menus";
    export default {
        name: 'PageHeaderMegaMenuBch',

        setup
    }

    async function setup() {
        const { t , locale } = useI18n();
        const siteStore    = useSiteStore();
        const menuStore = useMenusStore();

        const country = siteStore.config?.countries?.length? [...siteStore.config.countries, siteStore.config?.country] : siteStore.config?.country

        const { bch:data } = storeToRefs(menuStore);
        const children = makeMenu(data.value,t, siteStore.name,country, locale.value);
        const menu = ref({ title: t('bch'), href: 'https://bch.cbd.int', class: ['main-nav-sub-heading', 'arrow'], children });

        return { t, menu}
    }

    function makeMenu(data,t, name, passedCountry, passedLocale){
        const locale  = unLocales.includes(passedLocale.toLocaleLowerCase())? passedLocale.toLocaleLowerCase() : 'en';
        const country = Array.isArray(passedCountry)? passedCountry.map((c)=>`&country=${c}`).join('') : `&country=${passedCountry}`;
        const schemas = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert']
        const menus   = [];


        for (const schemaName in data) {

            if(!schemas.includes(schemaName)) continue;
            menus.push({
                            title: t(schemaName),
                            href : data[schemaName].href,
                            count: data[schemaName].count,
                            target:'_blank'
                        })
        }

        menus.push({
            title: `${name} ${t('View in BCH Portal')}`,
            href : `https://bch.cbd.int/${locale}/search?currentPage=1${country}`,
            class: ['main-nav-final-link'],
            target:'_blank'
        })
        return ref(menus)
    }
</script>