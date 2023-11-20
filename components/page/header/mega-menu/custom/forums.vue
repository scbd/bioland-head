<template>
    <div class="col-12 text-wrap px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />

        <PageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide">
                    <section v-for="(aChild,j) in menus[slotProps.country]" :key="j">
                        <p >
                            <NuxtLink  class="child-link" :class="aChild.class"   :to="aChild.href" :title="aChild.title"  external target="_blank">
                                {{aChild.title}}<span class="text-nowrap">&#65279;&nbsp;<Icon name="external-link"  class="ex-link" /></span>
                            </NuxtLink>
                        </p>
                    </section>
                </section>
            </Transition>
        </PageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/header/mega-menu/custom/forums.json"></i18n>
<script setup>
    import {  useSiteStore } from "~/stores/site";
    const { t } = useI18n();
    const menu  = ref({ 
                        title: t('Fourms'), 
                        href : '#', 
                        class: ['main-nav-sub-heading'] 
                    });
    const siteStore = useSiteStore();
 
    
    const menus      = computed(() => generateMenus());

    function generateMenus(){
        const countries = siteStore.countries;
        const countryMap = {};

        for(const country of countries){
            countryMap[country] = [];

            countryMap[country].push(
                ...generateCountrySet(country)
            )
        }

        return countryMap
    }

    function generateCountrySet(countryCode){
        const title = ' '+t('Country Profile');
        return [
            {
                title: t('CBD') + title,
                href : `https://www.cbd.int/countries/?country=${countryCode}`
            },
            {
                title: t('BCH') + title,
                href : `https://bch.cbd.int/en/countries/${countryCode}`
            },
            {
                title: t('ABSCH') + title,
                href : `https://absch.cbd.int/en/countries/${countryCode}`
            },
            {
                title: t('UN') + title,
                href : `https://data.un.org/en/iso/${countryCode}.html`
            },
            {
                title: t('InforMEA') + title,
                href : `https://data.un.org/en/iso/${countryCode}.html`
            }
        ]
    }
</script>

<style lang="scss" scoped>
.ex-link{
    fill:var(--bs-blue);
    transition: 0.3s;
}
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>