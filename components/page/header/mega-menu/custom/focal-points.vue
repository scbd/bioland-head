<template>
    <div class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide">
                    <section v-for="(aChild,j) in menus[slotProps.country]" :key="j">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="t(aChild.title, aChild.count)"  :menu="aChild" />
                        </p>
                    </section>
                </section>
            </Transition>
        </LazyPageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<script setup>
    const { t, locale } = useI18n();
    const menusStore    = useMenusStore();
    const menus         = computed(() => menusStore.nfps);
    const localePath    = useLocalePath();
    const systemPage    = menusStore.getSystemPageById(30);
    const aliasPath     = systemPage?.aliases[locale.value]? systemPage?.aliases[locale.value] : '/taxonomy/term/30';
    const href          = localePath(aliasPath);
    const menu          = ref({ 
                                title: t('National Contact Points'), 
                                href,
                                class: ['mm-main-nav-sub-heading', 'mm-arrow'] 
                            });
</script>

<style lang="scss" scoped>
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>