<template>
    <div class="text-capitalize mt-5">
        <h4 class="bm-3">{{t('GBIF')}} </h4>
    </div>


    <div style="height:300px; width:100%;">
        <LMap
            ref="map"
            :zoom="zoom"
            :center="config?.coordinates.reverse()"
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
    <div class="d-flex justify-content-between text-primary mt-2 mb-3">
        <div>
            <h5 class="fs-4 mb-1 ">1,382,381</h5>
            <NuxtLink class="text-decoration-underline" :to="occurrencesLink" external target="_blank">{{t('Occurrence')}}</NuxtLink>
        </div>
        <div>
            <h5 class="fs-4 mb-1 ">1,382</h5>
            <NuxtLink class="text-decoration-underline" :to="datasetsLink" external target="_blank">{{t('Datasets')}}</NuxtLink>
        </div>
        <div>
            <h5 class="fs-4 mb-1 ">334</h5>
            <NuxtLink class="text-decoration-underline" :to="publishersLink" external target="_blank">{{t('Publishers')}}</NuxtLink>
        </div>
    </div>
    <div v-for="(link,i) in links || []" :key="i" class="text-start my-3">
        <NuxtLink :to="link.to" class="text-decoration-underline  text-primary  fw-bold fs-5" external target="_blank">
                {{t(link.name)}}
        </NuxtLink>
        &nbsp;

        <Icon   name="external-link" class="arrow" />
    </div>
  </template>
  
  <script setup>
  import cCenter from '~/util/country-center.js'
  import { useSiteStore } from '~/stores/site' ;
  const { t, locale } = useI18n();

  const siteStore = useSiteStore();

  const config = computed(getCountry)
  const zoom = ref(config.value.zoomLevel)

  const url = computed(()=> `https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}@2x.png?style=classic-noborder.poly&bin=hex&country=${config.value.identifier}&hasCoordinate=true&hasGeospatialIssue=false&advanced=false&srs=EPSG%3A3857`)

  function getCountry(){
    const { countries } = siteStore.params;
    const country = countries[[Math.floor(Math.random() * countries.length)]]

    return cCenter.find(({ identifier })=> identifier === country.toUpperCase())
  }

    const occurrencesLink = computed(()=> {
        const { countries } = siteStore.params;
        const countryString = countries.map((s)=>s.toUpperCase()).join('&country=')

        return  `https://www.gbif.org/occurrence/search?country=${countryString}`
    });

    const datasetsLink = computed(()=> {
        const { countries } = siteStore.params;
        const countryString = countries.map((s)=>s.toUpperCase()).join('&publishing_country=')

        return  `https://www.gbif.org/dataset/search?publishing_country=${countryString}`
    });

    const publishersLink = computed(()=> {
        const { countries } = siteStore.params;
        const countryString = countries.map((s)=>s.toUpperCase()).join('&country=')

        return  `https://www.gbif.org/dataset/search?country=${countryString}`
    });

  const links = [
//   { name: 'Browse GBIF Occurrences',  to:occurrencesLink.value },
//   { name: 'Browse GBIF Datasets',  to: datasetsLink.value },
//   { name: 'Browse GBIF Publishers',  to: publishersLink.value },
  { name: 'View all GBIF Data',  to:'https://www.gbif.org/search' },
]
//https://www.gbif.org/dataset/search?publishing_country=LK
//https://www.gbif.org/publisher/search?country=LK
//https://www.gbif.org/occurrence/search?country=LK
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