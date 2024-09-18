<template>
    <div class="position-relative">
        <Spinner v-if="loading" :is-modal="true" />
        <div v-if="!error">
            <div class="text-capitalize">
                <h4 :style="style" class="bm-3">{{t('GBIF')}} </h4>
            </div>


            <div style="height:300px; width:100%;">
                <LMap
                    ref="map"
                    :zoom="zoom"
                    :center="config?.coordinates.reverse()"
                    :use-global-leaflet="false"
                >
                <LTileLayer
                    url="https://tile.gbif.org/3857/omt/{z}/{x}/{y}@2x.png?style=gbif-classic"
                    layer-type="base"
                />
                <LTileLayer
                    :url="url"
                    layer-type="base"
                />

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

                <Icon   name="external-link" class="arrow" />
            </div>
        </div>
    </div>
  </template>
  <script setup>
  import cCenter from '~/util/country-center.js'
  import clone from 'lodash.clonedeep';
  const { t, locale } = useI18n();

  const siteStore = useSiteStore();

  const config = computed(getCountry)
  const zoom = ref(config.value?.zoomLevel)

  const url = computed(()=> `https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}@2x.png?style=classic-noborder.poly&bin=hex&country=${config?.value?.identifier}&hasCoordinate=true&hasGeospatialIssue=false&advanced=false&srs=EPSG%3A3857`)

    const style = reactive({ '--bs-primary': siteStore.primaryColor })
    const colorStyle = reactive({
         color: siteStore.primaryColor
      })


      const linkStyle = reactive({
        '--bs-primary': siteStore.primaryColor,
        color: siteStore.primaryColor,
        'text-decoration': `underline ${siteStore.primaryColor}`
      })

      const { countries=[] } = siteStore.params;
      const countryString = countries?.length? countries?.filter(x=>x).map((s)=>s.toUpperCase()).join('&country='): '';

  function getCountry(){
    const { countries } = siteStore.params;
    const   country     = countries[[Math.floor(Math.random() * countries.length)]]

    return cCenter.find(({ identifier })=> identifier === country?.toUpperCase())
  }

    const occurrencesLink = computed(()=> {
        const { countries=[] } = siteStore.params;
        const countryString = countries?.length? countries?.filter(x=>x).map((s)=>s.toUpperCase()).join('&country=') : '';

        return  `https://www.gbif.org/occurrence/search?country=${countryString}`
    });

    const datasetsLink = computed(()=> {
        const { countries=[] } = siteStore.params;
        const countryString = countries?.length? countries?.filter(x=>x).map((s)=>s.toUpperCase()).join('&publishing_country='): '';

        return  `https://www.gbif.org/dataset/search?publishing_country=${countryString}`
    });

    const publishersLink = computed(()=> {
        const { countries=[] } = siteStore.params;
        const countryString = countries?.length? countries?.filter(x=>x).map((s)=>s.toUpperCase()).join('&country='): '';

        return  `https://www.gbif.org/publisher/search?country=${countryString}`
    });

  const links = [
//   { name: 'Browse GBIF Occurrences',  to:occurrencesLink.value },
//   { name: 'Browse GBIF Datasets',  to: datasetsLink.value },
//   { name: 'Browse GBIF Publishers',  to: publishersLink.value },
  { name: 'View all GBIF Data',  to:`https://www.gbif.org/country/${countryString}/about`},
]

    const   query  = clone({...siteStore.params });
    const { data, status, error } =  await useLazyFetch(`/api/list/gbif`, {  method: 'GET', query });
    const loading = computed(()=> status.value === 'pending'); 
  </script>
  
  <style>
.arrow{
    fill:var(--bs-blue);
    width       : 1.3em;
    height      : 1.3em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}

  </style>