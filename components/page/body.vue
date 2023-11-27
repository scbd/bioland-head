<template>

    <div class="container">
        <div class="row">
            <div class="col-2">
                &nbsp;
            </div>
            <div class="col-10">
                <PageBreadCrumbs/>
            </div>

            <div class="col-2">
                <h2>Type</h2>

            </div>
            <div class="col-10">
                <h2>{{pageStore?.title}}</h2>
                <div style="float: right;width: 100px; height: 100px; background-color: #ff0000;">xxx</div>
                <p v-if="pageStore?.body?.value" v-html="pageStore.body.value"></p>
                
            </div>
            <div class="col-2">
                <h4>Menu for Testing</h4>
                <NuxtLink :to="localePath('/')">Home</NuxtLink><br/>
                <NuxtLink :to="localePath('/test')">Test</NuxtLink><br/>
                <NuxtLink :to="localePath('/search/abs')">Search Text abs</NuxtLink><br/>
            </div>
        </div>
    </div>
{{viewport.breakpoint}}
</template>
<script setup>
import { usePageStore } from "~/stores/page";

const route = useRoute();
const localePath = useLocalePath();
const pageStore  = usePageStore();
const viewport = useViewport();
</script>