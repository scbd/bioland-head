<template>
    <div id="page-header-staging-site-banner" class="dev-site  fixed-top " :style="bannerStyle">
        {{t('This is a staging website to review Bioland 2 and migrations')}}
    </div>
</template>
<script setup lang="ts">
    const { t } = useI18n();
    const siteStore = useSiteStore();
    const bannerStyle = computed(() => ({
        background: siteStore.primaryColor,
        color: contrastTextColor(siteStore.primaryColor),
    }));
</script>
<style scoped>
    .dev-site {
        padding: 1rem;
        text-align: center;
        font-size: .7rem;
    }
</style>
