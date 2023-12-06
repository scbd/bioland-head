<template>
    <section>
        <LazyPageHeaderMegaMenuCustomNationalReport    v-if="is('LazyPageHeaderMegaMenuCustomNationalReport')"/>
        <LazyPageHeaderMegaMenuCustomNationalReportSix v-if="is('LazyPageHeaderMegaMenuCustomNationalReportSix')"/>
        <LazyPageHeaderMegaMenuCustomBch               v-if="is('LazyPageHeaderMegaMenuCustomBch')"/>
        <LazyPageHeaderMegaMenuCustomAbsch             v-if="is('LazyPageHeaderMegaMenuCustomAbsch')"/>
        <LazyPageHeaderMegaMenuCustomFocalPoints       v-if="is('LazyPageHeaderMegaMenuCustomFocalPoints')"/>
        <LazyPageHeaderMegaMenuCustomCountryProfiles   v-if="is('LazyPageHeaderMegaMenuCustomCountryProfiles')" />
        <LazyPageHeaderMegaMenuCustomContentType       v-if="is('LazyPageHeaderMegaMenuCustomContentType')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomForums            v-if="is('LazyPageHeaderMegaMenuCustomForums')" :menu="menu"/>
        <LazyPageHeaderMegaMenuCustomMediaType         v-if="is('LazyPageHeaderMegaMenuCustomMediaType')" :menu="menu"/>
    </section>
</template>

<script setup>
    const   props              = defineProps({ is: String, menu: Object });
    const { is:componentName, menu } = toRefs(props);
    
    const is = (name) => componentName.value === name;
</script>