<template>

    <div class="container">
        <div class="row">
            <div class="col-3 ">
                &nbsp;
            </div>
            <div class="col-9 ps-0">
                <PageBreadCrumbs/>
            </div>

            <div class="col-3 d-none d-md-block">
                <h2 class="page-type">{{typeName}}</h2>
                <NuxtLink v-if="image.url"  :to="localePath(image.url)">
                    <NuxtImg :alt="image.alt" :src="image.src" class="img-fluid mt-5 w-100"/>
                </NuxtLink>
            </div>
            <div v-if="image.url" class="col-12 d-md-none">
                <NuxtLink :to="localePath(image.url)">
                    <NuxtImg :alt="image.alt" :src="image.src" class="img-fluid mt-5 w-100"/>
                </NuxtLink>
            </div>
            <div class="col-12 col-md-9 ps-0" >
                
                <h2  class="data-body" :class="{'has-hero': heroImage}" >{{title}}</h2>

                <div style="float: right;width: 100px; height: 100px; background-color: #ff0000;">xxx</div>

                <div v-if="body?.value" v-html="body?.value"></div>
                
            </div> 
        </div>
    </div>

    <div class="container mt-3">
        <div class="row">
            <div class="col-3">
                <h2 class="side-heading">GBF Targets</h2>
            </div>
            <div class="col-9">
                <GbfIcon :number="2"/>
                <GbfIcon :number="5"/>
                <GbfIcon :number="12"/>
                <GbfIcon :number="21"/>
                <GbfIcon :number="20"/>
            </div>
        </div>
    </div>

    <!-- <div class="container mt-3">
        <div class="row">
            <div class="col-12">
                <pre>{{pageStore}}</pre>
            </div>
        </div>
    </div> -->
</template>
<script setup>
import { usePageStore } from "~/stores/page";


const route = useRoute();
const localePath = useLocalePath();
const viewport = useViewport();

const pageStore = usePageStore()
const { title, body, heroImage, typeName, image } = storeToRefs( usePageStore());

</script>
<style lang="scss" scoped>
.data-body{

    padding-left: 0;
    border-top: black .5rem solid;
    padding-top: 1rem;

}
.has-hero{
        font-size: 1.2rem;
    }
.page-type{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
    color: var(--bs-primary);
}
.side-heading{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
}
</style>
