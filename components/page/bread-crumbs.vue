<template>
    <div class="my-3">
        <span>National CHM</span> > <span>{{route.params.type}}</span> 
    </div>
</template>
<script setup>
import { usePageStore } from "~/stores/page";

const route = useRoute();
const localePath = useLocalePath();
const pageStore  = usePageStore();
const viewport = useViewport();
</script>