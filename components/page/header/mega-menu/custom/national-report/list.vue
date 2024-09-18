<template>
    <div class="col-12 text-wrap px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />

        <PageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide">
                    <PageHeaderMegaMenuLink v-for="(aChild,i) in menus[slotProps.country]" :key="i" :menu="aChild" />

                    <PageHeaderMegaMenuLink :menu="finalLink(slotProps.country)" />
                </section>
            </Transition>
        </PageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<script setup >
    import { useMenusStore } from '~/stores/menus';

    const { t }      = useI18n();
    const menusStore = useMenusStore();
    const menus      = computed(() => menusStore.nr);

    const countries      = computed(()=>Object.keys(menus.value));
    const countriesQuery = countries?.value?.map((code) => `&hostGovernments_ss=${code}`).join('');
    const url            = `https://chm.cbd.int/database?schema_s=nationalReport6&schema_s=nationalReport`
    const menu           = ref({ 
                                title: t('National Reports'), 
                                href : `${url}${countriesQuery}`, 
                                class: ['mm-main-nav-sub-heading', 'mm-arrow'],
                                target: '_blank'
                            });


    function finalLink(code){
        return { 
                                    title: t('View all National Reports'), 
                                    href : `${url}&hostGovernments_ss=${code}`, 
                                    class: ['mm-main-nav-final-link', 'mm-arrow'],
                                    target: '_blank'
                                };
    }
</script>
<style lang="scss" scoped>  
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>