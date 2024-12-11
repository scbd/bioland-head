<template>
    <div class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuCustomNationalReportList v-if="!showNrSix"/>
        <LazyPageHeaderMegaMenuCustomNationalReportSix v-if="showNrSix"/>

    </div>
</template>

<script setup >
    const menusStore   = useMenusStore();
    const siteStore    = useSiteStore();
    const menus        = computed(() => menusStore.nrSix);
    const countries    = computed(() => Object.keys(menus.value));
    const nrSixData    = computed(() => unref(menus)[siteStore.config.country] || []);
    const showNrSix    = computed(() => (unref(countries).length === 1)&& unref(nrSixData).length );
</script>
