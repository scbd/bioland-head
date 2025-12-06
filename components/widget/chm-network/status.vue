<template >
    <div > 
        <div v-if="!Object.keys(statusData).length" class="spinner-border text-success" role="status">
            <span class="visually-hidden">{{t('Loading')}}...</span>
        </div>
        <div v-if="Object.keys(statusData).length">

            <div v-if="!isSiteUp || !isMigrated" >
                <div  class="mb-2 text-center"><LazyIcon name="thumbs-down" color="#8B0000" :size="3"/> </div>
                <p v-if="!hide">
                    <span  v-if="!isSiteUp"> <LazyIcon name="arrow-right" :size="2" color="#8B0000" class="me-1"/> <span class="fs-4 fw-bold"> {{t('Site is down')}}. </span><br></span>
                    <span v-if="!isMigrated"> <LazyIcon name="arrow-right" :size="2" color="#8B0000" class="me-1"/> <span class="fs-4 fw-bold"> {{t('Site has not been migrated')}}. </span><br></span>
                </p>
            </div>

            <div v-if="(!isTranslated || !hasLatestSeedVersion) && !hide" >
                <div  class="mb-2 text-center"><LazyIcon name="exclamation-triangle" color="#FFA07A" :size="3"/> </div>
                <p>
                    <span  v-if="!isTranslated"> <LazyIcon name="arrow-right" color="#FFA07A" :size="2" class="me-1"/> <span class="fs-5 fw-bold"> {{t('Site not fully translated')}}. </span><br></span>
                    <span v-if="!hasLatestSeedVersion"> <LazyIcon name="arrow-right" color="#FFA07A" :size="2" class="me-1"/> <span class="fs-5 fw-bold"> {{t('Site needs latest configurations update')}}. </span><br></span>
                </p>
            </div>

            <table v-if="statusData?.counts?.total > 0 && !hide" class="table">
                <thead >
                    <tr>
                        <th scope="col">{{t('Language')}}</th>
                        <th scope="col">{{t('Recordd Count')}}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(locale, index) in Object.keys(statusData.counts.locales)" :key="index">
                        <th scope="row">{{ locale }}</th>
                        <td>{{ statusData.counts.locales[locale]}}</td>
                    </tr>
                </tbody>
                <tfoot class="table-dark">
                    <tr >
                        <th scope="row">{{ t('Total:') }}</th>
                        <td>{{ statusData.counts.total}}</td>
                    </tr>
                </tfoot>
            </table>
            <div v-if="success" class="mb-2 text-center"><LazyIcon name="thumbs-up" color="#008000" :size="3"/> </div>
            <p v-if="success" class="text-center">
                <span> <LazyIcon name="arrow-right" color="#008000" :size="2" class="me-1"/> <span class="fs-4 fw-bold"> {{t('Site is up and running')}}. </span><br></span>
            </p>
        </div>

    </div>


</template>
<script setup> 
    const   getCachedData  = useGetCachedData();
    const   eventBus       = useEventBus();
    const   props         = defineProps({ 
        index: { type: Number} ,
        parentIndex: { type: Number} ,
        site: { type: Object, default: false } ,
        url: { type: String, default: false } ,
        hide: { type: Boolean, default: false } ,
    });
    const { index, site, url, parentIndex } = toRefs(props);
    const { t, locale }   = useI18n();
    const statusData = ref({});

    const isSiteUp             = ref(false);
    const isMigrated           = ref(false);
    const isTranslated         = ref(false);
    const hasLatestSeedVersion = ref(false);
    const success = ref(false);
  
    const migration = ref(false)

    onMounted(mounted);



    async function mounted(){
        setTimeout(async () => {
            const { defaultLocale, locales, published, hasBl1 } = site.value
            migration.value = !!(published && hasBl1);

            const query = migration.value? { url:url.value, defaultLocale, locales, migration }:{ url:url.value, defaultLocale, locales}
            const data  =  await  $fetchRetry(`/api/chm-network/status`, { query, method: 'GET',key: `chm-network-stats-widget-${index.value}`, getCachedData });
 
            statusData.value= data
            processStatus(data)
        }, 1500 * index.value || 1);
    }

    function processStatus(result){
        if(result.siteUp) isSiteUp.value = true;
        if(result.isMigrated) isMigrated.value = true;
        if(result.isTranslated) isTranslated.value = true;
        if(result.latestSeedConfiguration) hasLatestSeedVersion.value = true;

        if(!result.siteUp || !result.isMigrated)  eventBus.emit(`row-danger`, {index: index.value,parent: parentIndex.value});
        if(!result.latestSeedConfiguration || !result.isTranslated) eventBus.emit(`row-warn`, {index: index.value,parent: parentIndex.value});

        if(!result.siteUp || !result.isMigrated || !result.latestSeedConfiguration || !result.isTranslated) {
            success.value = false;
        } else {
            success.value = true;
            eventBus.emit(`td-success`, {index: index.value,parent: parentIndex.value});
        }

    }
</script>
