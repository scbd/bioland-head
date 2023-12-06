<template>
    <section>
        <LazyCardsMediaImage :record="record" v-if="isImage"/>
        <LazyCardsMediaVideo :record="record" v-if="isVideo"/>
        <LazyCardsMediaDocument :record="record" v-if="isDocument"/>
    </section>
</template>
<script setup>

    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);

    const { t, locale } = useI18n();

    
    const isImage = computed(()=> record.value?.type.endsWith('image'));
    const isVideo = computed(()=> record.value?.type.endsWith('video'));
    const isDocument = computed(()=> record.value?.type.endsWith('document'));
</script>
<style lang="scss" scoped>
.card {
    width: 384px !important;
    height: 450px !important;

}
.arrow{
    fill:var(--bs-blue);
    width       : 1.5em;
    height      : 1.5em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}
</style>
