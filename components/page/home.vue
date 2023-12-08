<template>

    <div class="container">
        <div class="row">
            <div class="col-12 pe-0 me-0" >
                <SwiperNewsUpdates  :slides="slides" type="media" :arrows="true" :pagination="false" :leftArrow="false"/>
            </div>
            <div class="col-12">
<!-- <pre>{{slides}}</pre> -->
            </div>
        </div>
    </div>

</template>
<script setup>
import { useMenusStore } from "~/stores/menus";
import { usePageStore } from "~/stores/page";
import { useSiteStore } from '~/stores/site';

const route = useRoute();
const localePath = useLocalePath();
const pageStore  = usePageStore();
const menuStore = useMenusStore();
const   siteStore                   = useSiteStore();


const drupalInternalIds = [2,3]

// const query = {drupalInternalIds, freeText}
const query  = { drupalInternalIds, ...siteStore.params };

const { data } = await useFetch(`/api/list/content`, {  method: 'GET', query });

const slides = computed(()=>data.value.data)
</script>