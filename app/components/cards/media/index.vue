<template>
    <section>
        <LazyCardsMediaImage    :record="record" v-if="isImage"/>
        <LazyCardsMediaVideo    :record="record" v-if="isVideo"/>
        <LazyCardsMediaDocument :record="record" v-if="isDocument"/>
    </section>
</template>
<script setup>
    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);

    const isImage    = computed(()=> record.value?.type.endsWith('image'));
    const isVideo    = computed(()=> record.value?.type.endsWith('video'));
    const isDocument = computed(()=> record.value?.type.endsWith('document'));
</script>
