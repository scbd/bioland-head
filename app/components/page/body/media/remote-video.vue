<template>
    <section id="page-body-media-remote-video" v-if="(pageStore.isVideo || pageStore.isMediaRemoteVideo) && url">
        <div id="page-body-media-remote-video-container" v-if="embedSrc" class="col-12 my-2">
            <iframe id="page-body-media-remote-video-iframe" class="remote-video" :src="embedSrc" :title="title" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
    </section>
</template>
<script setup>
    const   props            = defineProps({ url: { type: String }, title: { type: String } });
    const { url:u, title:t } = toRefs(props);

    const pageStore = usePageStore();
    const url       = computed(()=> pageStore?.video?.fieldMediaOembedVideo || u.value);
    const title     = computed(()=> pageStore?.video?.name || pageStore?.media?.title || t.value);
    const embedSrc  = computed(()=> getRemoteVideoEmbedSrc(url.value));
</script>
<style lang="scss" scoped>
.remote-video {
    aspect-ratio: 16 / 9;
    width: 100%;
}
</style>
