<template>
    <div class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menus" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide">
                    <section v-for="(aChild,j) in children" :key="j">
                        <p >
                            <LazyPageHeaderMegaMenuLink :title="aChild.title" :menu="aChild" />
                        </p>
                    </section>
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
    import clone from 'lodash.clonedeep';

    const { t, locale } = useI18n();
    const menusStore    = useMenusStore();
    const menus         = computed(() => menusStore.nfps);
    const localePath    = useLocalePath();
    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);
    const systemPage    = menusStore.getSystemPageById(30);
    const aliasPath     = systemPage?.aliases && systemPage?.aliases[locale.value]? systemPage?.aliases[locale.value] : `/taxonomy/term/${systemPageTidConstants. NATIONAL_CONTACT_POINTS}`;
    const href          = localePath(aliasPath);
    const menu          = ref({ 
                                title: t('National Contact Points'), 
                                href,
                                class: ['mm-main-nav-sub-heading', 'mm-arrow'] 
                            });

    const aMenu     = clone(unref(passedMenu));
    const children  = aMenu?.children || []; //.filter(aMenu => !isFinalLink(aMenu))
    
</script>

<style lang="scss" scoped>
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
}
</style>