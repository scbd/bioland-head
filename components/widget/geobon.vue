<template>
    <div class="position-relative">
        <LazySpinner v-if="loading" :is-modal="true" />
        <div v-if="!error">
            <div class="text-capitalize">
                <h4 :style="style" class="bm-3">{{t('GEO BON')}} </h4>
            </div>


            <div  class="card " >
                <h6 class="card-subtitle text-muted mb-1">{{t('EBV dataset')}}</h6>

                <div  v-if="hasImg" :style="backgroundStyles" class=" bg-light">
                    <NuxtLink  :to="goTo"  external target="_blank" ><div style="width:100%;height:200px;"></div></NuxtLink> 
                </div>

                <div v-if="record" class="card-body">
                    
                    <h5 class="card-title">
                        <p class="text-center mb-0"><span class="text-muted fs-6">{{t('Provided by the')}}</span> </p>
                        <p class="text-center"> {{record?.institution}}</p>
                        <hr class="mt-1 mb-3 text-small"/>
                        <NuxtLink  :to="goTo" external target="_blank" ><span :style="colorStyle">{{record.name}}</span></NuxtLink>


                    </h5>

                    <p class="card-text">{{trunc(record.description)}}</p>

                </div>
                <div class="card-footer">
                    <span  :style="bgStyle" v-if="record?.ecosystemType?.length" v-for="(type,i) in record?.ecosystemType" :key="i" class="badge  me-1"><span v-if="type">{{type}}</span></span>
                </div>
            </div>

            <div v-for="(link,i) in links || []" :key="i" class="text-start my-3">
                <NuxtLink :style="linkStyle" :to="link.to" class="fw-bold fs-5" :external="link.external" :target="link.external? '_blank' : '_self'">
                        {{link.name}}
                </NuxtLink>
                &nbsp;

                <LazyIcon  v-if="!link.external" name="arrow-right" class="arrow" />
                <LazyIcon  v-if="link.external" name="external-link" class="arrow" />


            </div>
        </div>
    </div>
</template>
<script setup>

    import clone from 'lodash.clonedeep';

    const { t }          = useI18n();
    const { trunc }      = useText();
    const localPath      = useLocalePath();
    const siteStore      = useSiteStore();
    const img            = useImage();
    const getCachedData  = useGetCachedData();

    const { bgStyle, style, colorStyle, linkStyle} = useTheme();

    const links = ref([])
    const countryCode = siteStore?.config?.country;

    if(siteStore?.config?.geoBonPage)
        links.value.push({ name: t('Browse EBV Datasets for')+' '+`${t(countryCode)}`,  to: { path: localPath(siteStore?.config?.geoBonPage||'/node/116') },           external: false })

    links.value.push( { name: t('EBV Data Portal'),       to: { path: `https://portal.geobon.org/home?country=${countryCode}` }, external: true  });

    const query      = clone({ ...siteStore.params });
    const { data:count, status:countStatus, error:countError } =  await useLazyFetch(`/api/list/geobon/count`, {  method: 'GET',query, getCachedData });

    const index = computed(()=> randomArrayIndexTimeBased(Number(count.value)));

    const { data:record, status, error} =  await useLazyFetch(`/api/list/geobon/${index.value}`, {  method: 'GET',query, key: 'geobon', getCachedData });
    const loading = computed(()=> countStatus.value === 'pending' || status.value === 'pending'); 

    const imgUri        = computed(() => record?.value?.id? `https://portal.geobon.org/data/upload/${record?.value?.id}/${record?.value?.file}` : ''); 
    const hasImg        = !!imgUri.value


    const backgroundStyles = computed(() => {

        const imageOptions = defaultImageOptions

        const imgSrc = img(imgUri.value, imageOptions);

        return {'background':`url('${imgSrc}') no-repeat center`,  'background-size': 'cover'}
        })

    const goTo = computed(()=> record?.value?.id?`https://portal.geobon.org/ebv-detail?id=${record?.value?.id}` : '#')

</script>
