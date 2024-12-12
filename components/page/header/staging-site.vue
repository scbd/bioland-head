<template>
    <div class="dev-site  fixed-top ">
        {{t('This is a staging website to review Bioland 2 and migrations')}}
    </div>
</template>
<script setup>
    const { t } = useI18n();
</script>
<style scoped>
    .dev-site {
        background: #756a8e;
        color: white;
        padding: 1 rem;
        text-align: center;
        font-size: .7 rem;
    }
</style>