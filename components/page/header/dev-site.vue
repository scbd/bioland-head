<template>
    <div v-if="isDevSite" class="dev-site  fixed-top ">
        This is a development/pre-production website
    </div>
</template>
<script setup>
    const siteStore = useSiteStore();
    const isDevSite = computed(()=> !siteStore?.config?.published);
</script>
<style scoped>
    .dev-site {
        background: #fe8a00;
        color: white;
        padding: 1 rem;
        text-align: center;
        font-size: .7 rem;
    }
</style>