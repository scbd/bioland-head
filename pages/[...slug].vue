<template>
    <Page/>
</template>
<script setup>
const pageStore = usePageStore();

if(pageStore?.isSearch)
    definePageMeta({ pageTransition: false, })
</script>