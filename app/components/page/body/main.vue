<template>
    <section id="page-body-main">
        <div id="page-body-main-body" :style="pageTypeStyle" v-if="pageStore?.body" v-html="htmlSanitize(pageStore?.body)"></div>
        <LazyFontAwesome v-if="hasFontAwesomeIcon(pageStore?.body)"/>
    </section>
</template>
<script setup>
    const   pageStore  = usePageStore();
    const { pageTypeStyle } = useTheme();
    
</script>
<style scoped>

</style>
