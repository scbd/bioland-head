<template>
    <div id="page-header-mega-menu-custom-country-profiles" class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="aMenu" />

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide" id="page-header-mega-menu-custom-country-profiles-content">
                    <section v-if="isTop" v-for="(aChild,j) in children" :id="`page-header-mega-menu-custom-country-profiles-child-${j}`" :key="j">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
                        </p>
                    </section>
                    <section v-for="(aChild,j) in menus[slotProps.country]" :id="`page-header-mega-menu-custom-country-profiles-country-link-${j}`" :key="j">
                        <p >
                            <NuxtLink  class="child-link" :class="aChild.class"   :to="aChild.href" :title="aChild.title"  external target="_blank">
                                {{aChild.title}}<span class="text-nowrap">&#65279;&nbsp;<LazyIcon name="external-link"  class="ex-link" /></span>
                            </NuxtLink>
                        </p>
                    </section>

                    <section v-if="!isTop" v-for="(aChild,j) in children" :id="`page-header-mega-menu-custom-country-profiles-child-${j}`" :key="`top-${j}`">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
                        </p>
                    </section>
                </section>
            </Transition>
        </LazyPageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';
    
    const { t } = useI18n();

    const siteStore = useSiteStore();
    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);

    const { menu: aMenu } = useMenuOverride(passedMenu, {
        defaultTitle: () => t('Country Profiles'),
        defaultHref: undefined,
        baseClasses: ['main-nav-sub-heading', 'arrow']
    });

    const menus     = computed(() => generateMenus());
    const children  = computed(() => aMenu.value?.children || []); 
    const isTop     = computed(()=>(!siteStore.biolandSettings?.megaMenu?.countryProfiles?.position || siteStore.biolandSettings?.megaMenu?.countryProfiles?.position === 'top')); 

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
                title: t('Convention on Biological Diversity') + title,
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