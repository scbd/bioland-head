<template>
    <PageList :types="types" title="photos-and-videos" />
</template>
<script setup>
const { path } = useRoute();

const types = computed(() => {
    return path?.includes('photos-and-videos')? ['image', 'remote-video'] : [];
});
</script>