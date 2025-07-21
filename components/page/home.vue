<template>
    <section>
        <LazyPageHomeChm v-if="!isBiosafetySite" />
        <LazyPageHomeBch v-if="isBiosafetySite" />
    </section>
</template>
<script setup>
const siteStore = useSiteStore();

const { isBiosafetySite }  = storeToRefs(siteStore);

</script>
