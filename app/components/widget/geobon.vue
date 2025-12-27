<template>
    <div class="position-relative">
        <!-- Placeholder shown during SSR and loading -->
        <template v-if="showWidget && (!hasHydrated || loading) && !error">
            <div class="text-capitalize placeholder-glow">
                <h4 class="bm-3"><span class="placeholder col-4"></span></h4>
            </div>
            <div class="card">
                <h6 class="card-subtitle text-muted mb-1 placeholder-glow"><span class="placeholder col-5"></span></h6>
                <!-- Map placeholder -->
                <div class="bg-light placeholder-glow" style="width:100%;height:200px;">
                    <span class="placeholder w-100 h-100"></span>
                </div>
                <div class="card-body">
                    <h5 class="card-title">
                        <p class="text-center mb-0 placeholder-glow"><span class="placeholder col-5"></span></p>
                        <p class="text-center placeholder-glow">
                            <span class="placeholder col-8"></span>
                        </p>
                        <hr class="mt-1 mb-3 text-small"/>
                        <span class="placeholder-glow">
                            <span class="placeholder col-10"></span>
                            <span class="placeholder col-6"></span>
                        </span>
                    </h5>
                    <p class="card-text placeholder-glow">
                        <span class="placeholder col-12"></span>
                        <span class="placeholder col-11"></span>
                        <span class="placeholder col-9"></span>
                    </p>
                </div>
                <div class="card-footer placeholder-glow">
                    <span class="badge bg-secondary placeholder me-1" style="width:60px;">&nbsp;</span>
                    <span class="badge bg-secondary placeholder me-1" style="width:50px;">&nbsp;</span>
                    <span class="badge bg-secondary placeholder me-1" style="width:80px;">&nbsp;</span>
                    <span class="badge bg-secondary placeholder me-1" style="width:70px;">&nbsp;</span>
                </div>
            </div>
            <div class="text-start my-3 placeholder-glow">
                <span class="placeholder col-7"></span>
            </div>
            <div class="text-start my-3 placeholder-glow">
                <span class="placeholder col-4"></span>
            </div>
        </template>

        <!-- Actual content after hydration and data loads -->
        <div v-else-if="!error && !countError&& count && showWidget && record">
            <div class="text-capitalize">
                <h4 :style="style" class="bm-3">{{t('GEO BON')}}</h4>
            </div>

            <div class="card">
                <h6 class="card-subtitle text-muted mb-1">{{t('EBV dataset')}}</h6>

                <div v-if="hasImg" :style="backgroundStyles" class="bg-light">
                    <NuxtLink :to="goTo" external target="_blank"><div style="width:100%;height:200px;"></div></NuxtLink> 
                </div>

                <div class="card-body">
                    <h5 class="card-title">
                        <p class="text-center mb-0"><span class="text-muted fs-6">{{t('Provided by the')}}</span></p>
                        <p class="text-center">{{record?.institution}}</p>
                        <hr class="mt-1 mb-3 text-small"/>
                        <NuxtLink :to="goTo" external target="_blank"><span :style="colorStyle">{{record.name}}</span></NuxtLink>
                    </h5>
                    <p class="card-text">{{trunc(record.description)}}</p>
                </div>
                <div class="card-footer">
                    <span :style="bgStyle" v-if="record?.ecosystemType?.length" v-for="(type,i) in record?.ecosystemType" :key="i" class="badge me-1"><span v-if="type">{{type}}</span></span>
                </div>
            </div>

            <div v-for="(link,i) in links || []" :key="i" class="text-start my-3">
                <NuxtLink :style="linkStyle" :to="link.to" class="fw-bold fs-5" :external="link.external" :target="link.external? '_blank' : '_self'">
                    {{link.name}}
                </NuxtLink>
                &nbsp;
                <LazyIcon v-if="!link.external" name="arrow-right" class="arrow" />
                <LazyIcon v-if="link.external" name="external-link" class="arrow" />
            </div>
        </div>
        <!-- Nothing shown on error (display:none behavior) -->
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

    // Track if client has hydrated
    const hasHydrated = ref(false);
    onMounted(() => {
        hasHydrated.value = true;
    });

    const showWidget     = computed(()=> !siteStore?.config?.hideHomePageWidgets?.geobon);
    const { bgStyle, style, colorStyle, linkStyle} = useTheme();

    const links = ref([])
    const countryCode = siteStore?.config?.country;

    if(siteStore?.config?.geoBonPage)
        links.value.push({ name: t('Browse EBV Datasets for')+' '+`${t(countryCode)}`,  to: { path: localPath(siteStore?.config?.geoBonPage||'/node/116') },           external: false })

    links.value.push( { name: t('EBV Data Portal'),       to: { path: `https://portal.geobon.org/home?country=${countryCode}` }, external: true  });

    const query      = clone({ ...siteStore.params });
    const { data:count, status:countStatus, error:countError } =  await useLazyFetch(`/api/list/geobon/count`, {  method: 'GET',query,key: 'geobon-count', getCachedData });

    const index = computed(()=> randomArrayIndexTimeBased(Number(count.value)));

    const { data:record, status, error} =  await useLazyFetch(`/api/list/geobon/${index.value}`, {  method: 'GET',query, key: 'geobon', getCachedData });
    const loading = computed(()=> countStatus.value === 'pending' || status.value === 'pending');

    const imgUri        = computed(() => record?.value?.id? `https://portal.geobon.org/data/upload/${record?.value?.id}/${record?.value?.file}` : ''); 
    const hasImg        = computed(() => !!imgUri.value);


    const backgroundStyles = computed(() => {

        const imageOptions = defaultImageOptions

        const imgSrc = img(imgUri.value, imageOptions);

        return {'background':`url('${imgSrc}') no-repeat center`,  'background-size': 'cover'}
        })

    const goTo = computed(()=> record?.value?.id?`https://portal.geobon.org/ebv-detail?id=${record?.value?.id}` : '#')

</script>
