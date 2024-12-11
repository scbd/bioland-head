<template >
        <div class="media-details-container p-2" :class="{ 'p-1': !vertical }">

                <div v-if="media.name" :class="{ 'flex-column mb-1': vertical }" class="d-flex">
                        <h5 >{{t('File Name')}}</h5>
                        <span class="text-break" v-if="!pageStore?.isImage">{{media.name}}</span>
                        <span class="text-break" v-if="pageStore?.isImage ">
                                <NuxtLink :to="pageStore?.image.src" target="_blank" download>
                                        {{media.name}}  <LazyIcon name="download" class="fs-4 ms-1"/>
                                </NuxtLink>
                        </span> 
                </div>
                <div v-if="media.fieldCaption" :class="{ 'flex-column mb-1': vertical }" class="d-flex">
                        <h5 >{{t('Caption')}}</h5>
                        <span>{{media.fieldCaption}}</span>
                </div>

                <div v-if="media.fieldHeight" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                        <h5 >{{t('Height')}}</h5>
                        <span>{{media.fieldHeight}} {{t('px')}}</span>
                </div>
                <div v-if="media.fieldWidth" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                        <h5 >{{t('Width')}}</h5>
                        <span>{{media.fieldWidth}} {{t('px')}}</span>
                </div> 
                <div v-if="media.fieldMime || media.filemime" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                        <h5 >{{t('Mime Type')}}</h5>
                        <span>{{media.fieldMime || media.filemime}}</span>
                </div> 
        <div v-if="media.fieldSize || media.filesize" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('File Size')}}</h5>
                <span>{{fileSize(media.fieldSize || media.filesize)}}</span>
        </div>
        <div v-if="media.created" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('Created Date')}}</h5>
                <span>{{dateFormat(media.created)}}</span>
        </div>
        <div v-if="media.changed" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('Updated Date')}}</h5>
                <span>{{dateFormat(media.changed)}}</span>
        </div>
        <div v-if="(pageStore?.isDocument || pageStore?.isMediaDocument)  && media?.downloadUrl" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('Download')}}</h5>
                <span>
                        <NuxtLink :to="media.downloadUrl" target="_blank" download>
                                <LazyIcon name="download" class="fs-2"/>
                        </NuxtLink>
                </span>  
        </div>
</div>
</template>
<script setup> 
        import prettyBytes from 'pretty-bytes';

        const   props         = defineProps({ vertical: { type: Boolean, default: false } });
        const { vertical    } = toRefs(props);
        const { t, locale }   = useI18n();
        const   dateFormat    = useDateFormat();
        const pageStore       = usePageStore();


const media = computed(()=> {

        if(pageStore.isImage || pageStore.isMediaImage) return {...pageStore.image, fieldPublished:pageStore.publishedOn};
        if(pageStore.isVideo || pageStore.isMediaRemoteVideo) return { ...pageStore.video, fieldPublished:pageStore.publishedOn};
        if(pageStore.isDocument || pageStore.isMediaDocument) {

                return {...pageStore.document,fieldPublished:pageStore.publishedOn};
        }
return {}
});

        function fileSize(size){
                return prettyBytes(Number(size), { locale: locale.value });
        }
</script>

<style lang="scss" scoped>
h5 {
    margin: 0 1.5rem 0 0 ;
    min-width: 110px;
}
.media-details-container:nth-child(odd){
    background-color: rgba(0, 158, 219, 0.15);
}
</style>