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
                    <!-- <p>{{t(slotProps.country)}}</p> -->
                    <div class="d-flex justify-content-start" >
                        <LazyCardsNt7 class="mx-2" :record="aChild" :no-flag="true" v-for="(aChild,j) in menus[slotProps.country]" :key="j"/>
                    </div>
                </section>
            </Transition>
        </LazyPageHeaderMegaMenuCustomCountryTab>
    </div>
</template>
<script setup>
    import clone from 'lodash.clonedeep';

    const { t, locale } = useI18n();
    const menusStore    = useMenusStore();
    const menus         = computed(() => menusStore.nt7);
    const localePath    = useLocalePath();
    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);
    const systemPage    = menusStore.getSystemPageById(31);
    //const aliasPath     = systemPage?.aliases && systemPage?.aliases[locale.value]? systemPage?.aliases[locale.value] : `/taxonomy/term/${systemPageTidConstants.NT7}`;
    const href     = computed(()=> localePath({path: menusStore.getSystemPagePath({ id:systemPageTidConstants.SEARCH_SEC, locale:unref(locale)}), query:{ schemaOnly: true, schemas:['nationalTarget7']}}));
   // const href          = localePath(aliasPath.value);
    const menu          = ref({ 
                                title: t('National Targets'), 
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