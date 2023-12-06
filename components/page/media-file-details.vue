<template >

<div class="media-details-container">
    <div v-if="name" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
            <h5 >{{t('File Name')}}</h5>
            <span>{{name}}</span>
    </div>
    <div v-if="fieldCaption" :class="{ 'flex-column mb-1': vertical }" class="d-flex">
            <h5 >{{t('Caption')}}</h5>
            <span>{{fieldCaption}}</span>
    </div>

    <div v-if="fieldHeight" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
            <h5 >{{t('Height')}}</h5>
            <span>{{fieldHeight}} {{t('px')}}</span>
    </div>
    <div v-if="fieldWidth" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
            <h5 >{{t('Width')}}</h5>
            <span>{{fieldWidth}} {{t('px')}}</span>
    </div>
    <div v-if="fieldMime" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
            <h5 >{{t('Mime Type')}}</h5>
            <span>{{fieldMime}}</span>
    </div>
    <div v-if="fieldSize" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
            <h5 >{{t('File Size')}}</h5>
            <span>{{fileSize(fieldSize)}}</span>
    </div>
    <div v-if="created" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
            <h5 >{{t('Created Date')}}</h5>
            <span>{{dateFormat(created)}}</span>
    </div>
    <div v-if="changed" :class="{ 'flex-column mb-1': vertical }" class="d-flex ">
            <h5 >{{t('Updated Date')}}</h5>
            <span>{{dateFormat(changed)}}</span>
    </div>
</div>
</template>
<i18n src="@/i18n/dist/components/page/media-file-details.json"></i18n>
<script setup>
    import { DateTime     } from 'luxon'        ;
    import { usePageStore } from '~/stores/page';
    import prettyBytes from 'pretty-bytes';

    const   props       = defineProps({ vertical: { type: Boolean, default: false } });
    const { vertical    } = toRefs(props);
    const { t, locale } = useI18n();

    const { name, fieldCaption, title, created, changed, fieldPublished, fieldWidth, fieldHeight, fieldMime, fieldSize, mediaImage  } = storeToRefs( usePageStore());

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