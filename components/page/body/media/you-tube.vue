<template>
    <section v-if="pageStore.isVideo && url">
        <div v-if="match" class="col-12 my-2">
            <iframe class="youtube-video" :src="`https://www.youtube.com/embed/${match}`" :title="title" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
    </section>
</template>
<script setup>

    const pageStore = usePageStore();
    const url       = pageStore?.video?.fieldMediaOembedVideo 
    const title     = pageStore?.video?.name || pageStore?.media?.title;
    const ombedUrl  = 'https://www.youtube.com/oembed?format=json&url=' + url;
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