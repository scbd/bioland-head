<template>
    <section>
        <div :style="pageTypeStyle" v-if="pageStore?.body" v-html="htmlSanitize(pageStore?.body)"></div>
    </section>
</template>
<script setup>
    const   pageStore  = usePageStore();
    const { pageTypeStyle } = useTheme();
    
</script>
<style scoped>

</style>