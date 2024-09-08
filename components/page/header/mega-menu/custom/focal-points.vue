<template>
    <div class="col-12 text-wrap px-0">
        <PageHeaderMegaMenuHeader  :menu="menu" />

        <PageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide">
                    <section v-for="(aChild,j) in menus[slotProps.country]" :key="j">
                        <p >
                            <PageHeaderMegaMenuLink :title="t(aChild.title, aChild.count)"  :menu="aChild" />
                            <!-- <NuxtLink  class="child-link" :class="aChild.class"   :to="aChild.href" :title="t(aChild.title)"  :external="aChild.target" target>
                                {{t(aChild.title || 'title')}}
                            </NuxtLink> -->
                        </p>
                    </section>
                </section>
            </Transition>
        </PageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<script setup>
    import {  useMenusStore } from "~/stores/menus";
    const { t } = useI18n();
    const menusStore = useMenusStore();
    const menus      = computed(() => menusStore.nfps);

    const hasCountries = computed(()=>Object.keys(menus.value).length > 1);
    const country      = hasCountries.value?    '/'+Object.keys(menus.value)[0] : '';
    const menu  = ref({ 
                        title: t('National Contact Points'), 
                        href : '/focal-points', 
                        class: ['mm-main-nav-sub-heading', 'mm-arrow'] 
                    });


</script>

<style lang="scss" scoped>
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>