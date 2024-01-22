<template>
    <div class="text-capitalize mt-2">
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
            <h5 class="fs-3 mb-0 ">1,382,381</h5>
            <NuxtLink class="text-decoration-underline" to="/">{{t('Occurrence')}}</NuxtLink>
        </div>
        <div>
            <h5 class="fs-3 mb-0 ">1,382</h5>
            <NuxtLink class="text-decoration-underline" to="/">{{t('Datasets')}}</NuxtLink>
        </div>
        <div>
            <h5 class="fs-3 mb-0 ">334</h5>
            <NuxtLink class="text-decoration-underline" to="/">{{t('Publishers')}}</NuxtLink>
        </div>
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
  </script>
  
  <style>
  body {
    margin: 0;
  }
  </style>