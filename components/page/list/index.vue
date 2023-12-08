<template>

    <div class="container mt-3">
        <div class="row">
            <div class="col-md-3">
                &nbsp;
            </div>
            <div class="col-12 col-md-9 ps-0">
                <PageBreadCrumbs/>
            </div>
            <div class="col-12 col-md-3 ps-0" >
                <h2 class="page-type">{{t(type || 'Content Type')}}</h2>
                <PageListTextSearch/>
            </div>

            <div class="col-12 col-md-9 data-body" >
                <div class="card p-1 mb-3" v-for="(aLine,index) in data.data" :key="index">
                    <div class="row g-0">
                        <div :class="{'col-9': aLine.mediaImage, 'col-12': !aLine.mediaImage }">
                            <div class="card-body pe-1">
                                <h5 class="card-title">{{aLine.title}}</h5>
                                <p v-if="aLine.summary" class="card-text">{{aLine.summary}}...</p>
                                <!-- <p class="card-text"><small class="text-muted">Last updated 3 mins ago</small></p> -->
                            </div>
                        </div>
                        <div v-if="aLine.mediaImage" class="col-md-3">
                            <NuxtImg class="img-fluid rounded-start" :alt="aLine.mediaImage.alt" :src="aLine.mediaImage.src" :width="aLine.mediaImage.width" :height="aLine.mediaImage.height" />
                        </div>
                        <div class="col-12 ">
                            <div class="card-footer pb-0 text-center">
                                <ul class="float-start">
                                    <li v-if="!isSingleType"><span class="text-primary text-uppercase">{{type}}</span></li>
                                    <li v-if="aLine?.tags?.countries?.length" v-for="(aCountry,i) in aLine.tags?.countries" :key="i"   class="text-uppercase" >
                                        <NuxtLink :to="`https://www.cbd.int/countries/?country=${aCountry.identifier}`" target="_blank" external>
                                            {{aCountry.name}}
                                        </NuxtLink>
                                    </li>

                                </ul>

                                <span v-if="aLine?.tags?.gbfTargets?.length" v-for="(aTarget,i) in aLine?.tags?.gbfTargets" :key="i"  >
                                    <GbfIcon :identifier="aTarget.identifier" size="xs"/>
                                </span>
                                <span v-if="aLine?.tags?.sdgs?.length" v-for="(aSdg,i) in aLine?.tags?.sdgs" :key="i"  >
                                    <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                                </span>
                                <p class="float-end card-text pe-1"><small class="text-muted">{{dateFormat(aLine.fieldStartDate || aLine.fieldPublishedDate || aLine.changed)}}</small></p>
                            </div>
                            
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

</template>
<script setup>
import { DateTime     } from 'luxon'  
import { useSiteStore } from '~/stores/site';
import { useMenusStore } from '~/stores/menus';

const { t, locale } = useI18n();

const   route                       = useRoute();
const   siteStore                   = useSiteStore();
const { type }                      = route.params;
const { contentTypes, mediaTypes }  = useMenusStore();


const isContentType = computed(()=>!!contentTypes[type]);
const isMediaType   = computed(()=>!!mediaTypes[type]);
const isDrupalType  = computed(()=> isContentType.value || isMediaType.value);
const isSingleType  = computed(()=> isDrupalType.value && !route?.query?.drupalInternalIds?.length);
const drupalTypes   = { ...contentTypes, ...mediaTypes };

// const list = computed(()=>isDrupalType.value? drupalTypes[type] : {});

const drupalInternalIds = [8,9,10]
const freeText = 'for'
// const query = {drupalInternalIds, freeText}
const query  = { ...route.query, ...siteStore.params };
const typeId = drupalTypes[type]?.drupalInternalId? '/'+drupalTypes[type]?.drupalInternalId : '';

const { data } = await useFetch(`/api/list/content${typeId}`, {  method: 'GET', query });



watch(() => route.query, () => consola.warn('query changed', route.query))

function getQuery(){
    const { drupalInternalIds, freeText, page, rowsPerPage } = route.query;

    return { drupalInternalIds, freeText, page, rowsPerPage }
}

consola.warn(getQuery())
// if(!isDrupalType.value){
//error
// }

    function dateFormat(date){
        return DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy');
    }
</script>

<style scoped>
.card{
    background-color: #eee;
    border-left: 7px solid var(--bs-blue);
}
.card:hover{
    cursor: pointer !important;
    box-shadow:  0 10px 20px rgb(0 0 0 / 19%), 0 6px 6px rgb(0 0 0 / 23%) ;
    background-color: #e1e1e1;
}

ul{
    display: inline-block;
    list-style-type: disc;
    margin-block-start: 0px;
    margin-block-end: 0px;
    margin-inline-start: 0px;
    margin-inline-end: 0px;
    padding-inline-start: 0px;
}
li{
    display: inline;
    margin: .2rem;
    padding: 0;
    border-right: solid 1px #999;
    padding-right: .5rem;
}
li:last-child{
    border-right: none;
}
li a{
    color: #333;
}
.side-heading{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
}
.page-type{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
    color: var(--bs-primary);
}
.data-body{

padding-left: 0;
border-top: black .5rem solid;
padding-top: 1rem;

}
</style>