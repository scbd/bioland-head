<template>

    <div class="container mt-3">
        <div class="row">
            <div class="col-12">
                <h4 class="text-wrap position-relative d-inline-block mb-2">
                   {{type}} <!-- {{list.name}} -->
                </h4>
            </div>
            <div class="col-12" v-for="(aLine,index) in data.data" :key="index">
                <!-- <h5>{{aLine.title}}</h5> -->
                <div class="card p-1 mb-3" >
                    <div class="row g-0">
                        <!-- <div class="col-md-4">
                        <img src="..." class="img-fluid rounded-start" alt="...">
                        </div> -->
                        <div class="col-12">
                            <div class="card-body">
                                <h5 class="card-title">{{aLine.title}}</h5>
                                <!-- <p class="card-text">This is a wider card with supporting text below as a natural lead-in to additional content. This content is a little bit longer.</p>
                                <p class="card-text"><small class="text-muted">Last updated 3 mins ago</small></p> -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- <div class="col-12" v-for="(aLine,index) in list.data" :key="index" >

                <h5>{{aLine.title}}</h5>


                
            </div> -->
        </div>
    </div>

</template>
<script setup>
import { usePageStore } from '~/stores/page';
import { useSiteStore } from '~/stores/site';
import { useMenusStore } from '~/stores/menus';
const route = useRoute();
const { type } = route.params;
const siteStore = useSiteStore();
const { contentTypes, mediaTypes }  = useMenusStore();

const isContentType = computed(()=>!!contentTypes[type]);
const isMediaType = computed(()=>!!mediaTypes[type]);
const isDrupalType = computed(()=> isContentType.value || isMediaType.value);
const drupalTypes  = { ...contentTypes, ...mediaTypes };

const list = computed(()=>isDrupalType.value? drupalTypes[type] : {});

const drupalInternalIds = [8,9,10]
const freeText = 'for'
// const query = {drupalInternalIds, freeText}
const query = { ...route.query, ...siteStore.params };

const { data } = await useFetch(`/api/list/content/9`, {  method: 'GET', query });



watch(() => route.query, () => consola.warn('query changed', route.query))

function getQuery(){
    const { drupalInternalIds, freeText, page, rowsPerPage } = route.query;

    return { drupalInternalIds, freeText, page, rowsPerPage }
}
// if(!isDrupalType.value){
//error
// }
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
</style>