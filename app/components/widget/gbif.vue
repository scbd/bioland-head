<template>
    <div class="position-relative">
       
        <!-- Show placeholder during SSR and loading, hide after if widget disabled -->
        <template v-if="!isHydrated || (isHydrated && showWidget && loading)">
            <div class="text-capitalize placeholder-glow">
                <h4 class="bm-3"><span class="placeholder" style="width:50px;"></span></h4>
            </div>
            <!-- Map placeholder -->
            <div class="bg-light placeholder-glow" style="width:100%;height:300px;">
                <span class="placeholder w-100 h-100"></span>
            </div>
            <!-- Stats placeholder -->
            <div class="d-flex justify-content-between mt-2 mb-3">
                <div class="placeholder-glow">
                    <h5 class="fs-4 mb-1"><span class="placeholder" style="width:80px;"></span></h5>
                    <span class="placeholder" style="width:100px;"></span>
                </div>
                <div class="placeholder-glow">
                    <h5 class="fs-4 mb-1"><span class="placeholder" style="width:50px;"></span></h5>
                    <span class="placeholder" style="width:70px;"></span>
                </div>
                <div class="placeholder-glow">
                    <h5 class="fs-4 mb-1"><span class="placeholder" style="width:40px;"></span></h5>
                    <span class="placeholder" style="width:100px;"></span>
                </div>
            </div>
            <!-- Link placeholder -->
            <div class="text-start my-3 placeholder-glow">
                <span class="placeholder col-5"></span>
            </div>
        </template>

        <!-- Actual content after hydration - only if widget enabled -->
        <div class="mb-4" v-else-if="isHydrated && showWidget && !error">
                <div class="text-capitalize">
                    <h4 :style="style" class="bm-3">{{t('GBIF')}} </h4>
                </div>


                <div style="height:300px; width:100%;">
                    <LMap ref="map" :zoom="zoom" :center="center" :use-global-leaflet="false" >
                        <LTileLayer url="https://tile.gbif.org/3857/omt/{z}/{x}/{y}@2x.png?style=gbif-classic" layer-type="base" />
                        <LTileLayer :url="url" layer-type="base" />
                    </LMap>
                </div>
                <div v-if="data" class="d-flex justify-content-between text-primary mt-2 mb-3">
                    <div>
                        <h5 :style="colorStyle" class="fs-4 mb-1 ">{{data?.occurrences}}</h5>
                        <NuxtLink :style="linkStyle" class="text-decoration-underline" :to="occurrencesLink" external target="_blank">{{t('Occurrence')}}</NuxtLink>
                    </div>
                    <div>
                        <h5 :style="colorStyle" class="fs-4 mb-1 ">{{data?.datasets}}</h5>
                        <NuxtLink :style="linkStyle" class="text-decoration-underline" :to="datasetsLink" external target="_blank">{{t('Datasets')}}</NuxtLink>
                    </div>
                    <div>
                        <h5 :style="colorStyle" class="fs-4 mb-1 ">{{data?.publishers}}</h5>
                        <NuxtLink :style="linkStyle" class="text-decoration-underline" :to="publishersLink" external target="_blank">{{t('Publishers')}}</NuxtLink>
                    </div>
                </div>
                <div v-for="(link,i) in links || []" :key="i" class="text-start my-3">
                    <NuxtLink :style="linkStyle" :to="link.to" class="fw-bold fs-5" external target="_blank">
                            {{t(link.name)}}
                    </NuxtLink>
                    &nbsp;

                    <LazyIcon   name="external-link" />

                    <span class="hide">&nbsp;&nbsp;&nbsp;&nbsp;{{config?.identifier}} - {{zoom}} map.zoom: {{map?.zoom}}</span>
                </div>

            </div>
        </div>

</template>
<script setup>
    import clone   from 'lodash.clonedeep';

    const { t }     = useI18n();
    const siteStore = useSiteStore();
    const config    = computed(getCountry);
    const center    = computed(() => config.value?.latitude && config.value?.longitude ? [config.value.latitude, config.value.longitude] : [0, 0]);
    const zoom      = computed(() => config.value?.zoomLevel || 4);
    const showWidget     = computed(()=> siteStore?.biolandSettings?.homeWidgets?.gbifWidget?.enable);
    const getCachedData  = useGetCachedData();
    const map            = ref(null);

    // Track client hydration to prevent hydration mismatch
    const isHydrated = ref(false);
    onMounted(() => {
        isHydrated.value = true;
    });

    const { style, colorStyle, linkStyle} = useTheme();

    const url = computed(()=> `https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}@2x.png?style=classic-noborder.poly&bin=hex&country=${config?.value?.identifier}&hasCoordinate=true&hasGeospatialIssue=false&advanced=false&srs=EPSG%3A3857`);

    function getCountry(){
        const { countries, country:c } = siteStore.params;
        const   countryIndex           = randomArrayIndexTimeBased(countries.length);
        const   country                = (countries[countryIndex] || c)?.toLowerCase();
        const   gbifWidget             = siteStore?.biolandSettings?.homeWidgets?.gbifWidget;

        if (!gbifWidget?.countries?.[country])
            return null;

        return {
            identifier: country?.toUpperCase(),
            ...gbifWidget.countries[country]
        };
    }

    const occurrencesLink = computed(()=> {
        const countryString  = siteStore.params?.countries?.length? siteStore.params.countries?.filter(x=>x).map((s)=>s.toUpperCase()).join('&country='): '';

        return  `https://www.gbif.org/occurrence/search?country=${countryString}`
    });

    const datasetsLink = computed(()=> {
        const countryString = siteStore.params?.countries?.length? siteStore.params.countries?.filter(x=>x).map((s)=>s.toUpperCase()).join('&publishing_country='): '';

        return  `https://www.gbif.org/dataset/search?publishing_country=${countryString}`
    });

    const publishersLink = computed(()=> {
        const { country } = siteStore.params;

        return  country? `https://www.gbif.org/publisher/search?country=${country}` : `https://www.gbif.org/publisher/search`
    });

    const viewAllLink = computed(()=> {
        const { country } = siteStore.params;
        const  to         = country? `https://www.gbif.org/country/${country}` : `https://www.gbif.org/the-gbif-network`;

        return  { name: 'View all GBIF Data',  to, external: true }
    });

    const links = [ viewAllLink.value ];
    const query = clone({...siteStore.params });
    
    const { data, status, error } =  await useLazyFetch(`/api/list/gbif`, {  method: 'GET', query, key: 'gbif-widget', getCachedData });

    const loading = computed(()=> status.value === 'pending'); 
</script>
<style scoped>
    .hide{ color:white; }
    .hide:hover{ color: black }
</style>