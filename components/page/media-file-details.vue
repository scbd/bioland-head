<template >

<div></div>

        <div class="media-details-container p-2" :class="{ 'p-1': !vertical }">
                <div v-if="media.name" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                        <h5 >{{t('File Name')}}</h5>
                        <span v-if="!pageStore?.isImage">{{media.name}}</span>
                        <span v-if="pageStore?.isImage">
                                <NuxtLink :to="pageStore?.image.src" target="_blank" download>
                                        {{media.name}}  <Icon name="download" class="fs-4 ms-1"/>
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
                <div v-if="media.fieldMime" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                        <h5 >{{t('Mime Type')}}</h5>
                        <span>{{media.fieldMime}}</span>
                </div> 
        <div v-if="media.fieldSize" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('File Size')}}</h5>
                <span>{{fileSize(media.fieldSize)}}</span>
        </div>
        <div v-if="media.created" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('Created Date')}}</h5>
                <span>{{dateFormat(media.created)}}</span>
        </div>
        <div v-if="media.changed" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('Updated Date')}}</h5>
                <span>{{dateFormat(media.changed)}}</span>
        </div>
        <div v-if="pageStore?.isDocument && media?.downloadUrl" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
                <h5 >{{t('Download')}}</h5>
                <span>
                        <NuxtLink :to="media.downloadUrl" target="_blank" download>
                                <Icon name="download" class="fs-2"/>
                        </NuxtLink>
                </span>  
        </div>
</div>
</template>
<script setup>
        import { DateTime     } from 'luxon'        ;
        import { usePageStore } from '~/stores/page';
        import { useSiteStore } from '~/stores/site';
        import prettyBytes from 'pretty-bytes';

        const   props       = defineProps({ vertical: { type: Boolean, default: false } });
        const { vertical    } = toRefs(props);
        const { t, locale } = useI18n();
        const siteStore = useSiteStore();

        const pageStore = usePageStore();

        // const { typeId, videos,video,document, image, name, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImag, documentUri  } = storeToRefs( usePageStore());

const media = computed(()=> {

        if(pageStore.isImage) return {...pageStore.image, fieldPublished:pageStore.publishedOn};
        if(pageStore.isVideo) return { ...pageStore.video, fieldPublished:pageStore.publishedOn};
        if(pageStore.isDocument) {
   
                return {...pageStore.document,fieldPublished:pageStore.publishedOn};
        }
return {}
});
        function dateFormat(date){
                return DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy');
        }

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