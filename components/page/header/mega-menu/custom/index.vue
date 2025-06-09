<template>
    <section>
        <LazyPageHeaderMegaMenuCustomNationalReport    v-if="is('LazyPageHeaderMegaMenuCustomNationalReport')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomNationalReportSix v-if="is('LazyPageHeaderMegaMenuCustomNationalReportSix')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomBch               v-if="is('LazyPageHeaderMegaMenuCustomBch')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomAbsch             v-if="is('LazyPageHeaderMegaMenuCustomAbsch')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomFocalPoints       v-if="is('LazyPageHeaderMegaMenuCustomFocalPoints')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomCountryProfiles   v-if="is('LazyPageHeaderMegaMenuCustomCountryProfiles')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomContentType       v-if="is('LazyPageHeaderMegaMenuCustomContentType')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomForums            v-if="is('LazyPageHeaderMegaMenuCustomForums')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomMediaType         v-if="is('LazyPageHeaderMegaMenuCustomMediaType')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomNationalTargets_7 v-if="is('LazyPageHeaderMegaMenuCustomNationalTargets_7')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomAllContentTypes v-if="is('LazyPageHeaderMegaMenuCustomAllContentTypes')" :menu="menu"/>
    </section>
</template>

<script setup>
    const   props = defineProps({ is: String, menu: Object });

    const { is:componentName, menu } = toRefs(props);

    const is = (name) => componentName.value === name;
</script>