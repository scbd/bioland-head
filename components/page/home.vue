<template>

    <div class="container">
        <div class="row">
            <div class="col-12">
                home page
            </div>
            <!-- <div class="col-10">
                {{route.path}}
            </div>
            <div class="col-2">
                &nbsp;
                <h4>Menu for Testing</h4>
                <NuxtLink :to="localePath('/')">Home</NuxtLink><br/>
                <NuxtLink :to="localePath('/test')">Test</NuxtLink><br/>
                <NuxtLink :to="localePath('/search/abs')">Search Text abs</NuxtLink><br/>
            </div>
            <div class="col-10">
                <div v-if="pageStore?.body?.value" v-html="pageStore.body.value"></div>
            </div> -->
        </div>
    </div>

</template>
<script setup>
import { usePageStore } from "~/stores/page";

const route = useRoute();
const localePath = useLocalePath();
const pageStore  = usePageStore();

</script>