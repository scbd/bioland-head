<template>
    <div class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuCustomNationalReportList v-if="!showNrSix" :menu="passedMenu"/>
        <LazyPageHeaderMegaMenuCustomNationalReportSix v-if="showNrSix" :menu="passedMenu"/>

    </div>
</template>

<script setup >


    const menusStore   = useMenusStore();
    const siteStore    = useSiteStore();
    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);


    const menus        = computed(() => menusStore.nrSix);
    const countries    = computed(() => Object.keys(menus.value));
    const nrSixData    = computed(() => unref(menus)[siteStore.config.country] || []);
    const showNrSix    = computed(() => (unref(countries).length === 1)&& unref(nrSixData).length );
</script>
