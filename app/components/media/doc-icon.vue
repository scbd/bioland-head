<template>
    <Icon :name="icon.name" :color="icon.color" :size="size"/>
</template>
<script setup>
    const props = defineProps({
                                mime: { type: String, default: '' },
                                uri : { type: String, default: '' },
                                size: { type: Number, default: 1 }
                              });

    const { mime, uri, size } = toRefs(props);

    const icon = computed(()=> getDocumentIcon(uri.value, mime.value));
</script>
