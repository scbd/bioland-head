<template>
    <section v-if="(pageStore.isVideo || pageStore.isMediaRemoteVideo) && url">
        <div v-if="match" class="col-12 my-2">
            <iframe class="youtube-video" :src="`https://www.youtube.com/embed/${match}`" :title="title" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
    </section>
</template>
<script setup>
    const   props               = defineProps({ url: { type: String }, title: { type: String } });
    const { url:u, title:t    } = toRefs(props);

    const pageStore = usePageStore();
    const url       = computed(()=>pageStore?.video?.fieldMediaOembedVideo || u.value);
    const title     = computed(()=>pageStore?.video?.name || pageStore?.media?.title || t.value);
    const ombedUrl  = 'https://www.youtube.com/oembed?format=json&url=' + url.value;
    const ombedHtml = (await useFetch(ombedUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } })).data;
    const pattern   = /src="https:\/\/www.youtube.com\/embed\/([^?]+)\?feature=oembed"/;

    const matches = ombedHtml.value?.html?.match(pattern);
    const match   = matches? ref(matches[1]) : ref(null);

</script>
<style lang="scss" scoped>
.youtube-video {
    aspect-ratio: 16 / 9;
    width: 100%;
}
</style>