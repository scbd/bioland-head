<template>
    <div style="height:300px; width:100%;">
      <LMap
        ref="map"
        :zoom="zoom"
        :center="[47.21322, -1.559482]"
      >
        <LTileLayer
          url="https://tile.gbif.org/3857/omt/{z}/{x}/{y}@2x.png?style=gbif-classic"

          layer-type="base"
          name="OpenStreetMap"
        />
        <LTileLayer
          url="https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}@2x.png?style=purpleYellow-noborder.poly&squareSize=16&country=LK&hasCoordinate=true&hasGeospatialIssue=false&advanced=false&srs=EPSG%3A3857"

          layer-type="base"
          name="OpenStreetMap"
        />
        <!-- <l-wms-tile-layer
            :key="wmsLayer.name"
          
            :url="wmsLayer.url"
            :layers="wmsLayer.layers"
            :visible="wmsLayer.visible"
            :name="wmsLayer.name"
            :attribution="wmsLayer.attribution"
            :transparent="true"
            format="image/png32"
            layer-type="base"
            > 
</l-wms-tile-layer>-->
      </LMap>
    </div>
  </template>
  
  <script setup>
  import cCenter from '~/util/country-center.js'
   const wmsLayer = ref({
    key: 'UN-Clear-Map',
    name: 'UN Clear Map',
    url: 'https://geoservices.un.org/arcgis/services/ClearMap_Dark/MapServer/WMSServer?request=GetCapabilities&service=WMS',
    layers: '0',
    visible: true,
    attribution: 'UN Clear Map'
   })
//   const url = 'https://geoservices.un.org/arcgis/rest/services/ClearMap_Plain/MapServer?request=GetCapabilities&service=WMS'
  const zoom = ref(1)

  consola.warn(cCenter)
  </script>
  
  <style>
  body {
    margin: 0;
  }
  </style>