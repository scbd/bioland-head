<template>
    <div class="dev-site  fixed-top ">
        {{t('This is a development/pre-production website')}}
    </div>
</template>
<script setup>
    const { t } = useI18n();
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