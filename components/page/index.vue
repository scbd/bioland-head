<template>
    <!-- <pre>{{pageStore}}</pre> -->
    <PageBody v-if="pageStore.isPage"/>
    <PageList v-if="pageStore.isSearch"/>
</template>

<script setup>
    const pageStore = usePageStore();
</script>