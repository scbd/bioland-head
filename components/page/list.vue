<template>

    <div class="container mt-3">
        <div class="row">
            <div class="col-12">
                <h4 class="text-wrap position-relative d-inline-block mb-2">
                    {{list.name}}
                </h4>
            </div>

            <div class="col-12" v-for="(aLine,index) in list.data" :key="index" >

                <h5>{{aLine.title}}</h5>
                <!-- <p>{{}}</p> -->
            </div>
        </div>
    </div>

</template>
<script setup>
import { usePageStore } from '~/stores/page';
import { useMenusStore } from '~/stores/menus';
const route = useRoute();
const { type } = route.params;

const { contentTypes, mediaTypes }  = useMenusStore();

const isContentType = computed(()=>!!contentTypes[type]);


const list = computed(()=>isContentType.value? contentTypes[type] : mediaTypes[type]);

</script>