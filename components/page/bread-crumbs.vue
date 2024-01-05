<template>
    <div class="my-2">
        <NuxtLink class="fw-bold" :to="localePath('/')">
            {{t('National CHM')}}
        </NuxtLink>
        <span>&nbsp; <Icon name="triangle-right"/> &nbsp;</span>
        <span v-for="(aCrumb,index) in crumbs" :key="index">
            <NuxtLink @click="openMenu(aCrumb)" v-if="!isSelf(aCrumb.href)" :to="localePath(aCrumb.href)"  >
                {{aCrumb.title}}
            </NuxtLink>
            <span v-if="!isSelf(aCrumb.href)">&nbsp; <Icon name="triangle-right"/> &nbsp;</span>
        </span>

        <span v-if="count" class="text-muted float-end"> &nbsp; {{t('record', count)}}</span>
        <span v-if="count" class="badge rounded-pill bg-primary float-end" >{{count}}</span>
    </div>
</template>
<i18n src="@/i18n/dist/components/page/bread-crumbs.json"></i18n>
<script setup>
import { usePageStore } from "~/stores/page";
import { useMenusStore } from "~/stores/menus";

const { t  }    = useI18n();
const   props   = defineProps({ count: { type: Number } });
const { count } = toRefs(props);

const route      = useRoute();
const localePath = useLocalePath();
// const pageStore  = usePageStore();
const menusStore = useMenusStore();
const inMenu     = ref(menusStore.isInMainMenu(route.path) || menusStore.isInMainMenu(parentPath()));
const eventBus   = useEventBus();
const crumbs     = computed(()=> inMenu?.value? inMenu.value?.crumbs : []);


function isSelf(href){ return href === route.path; }

function openMenu({ href, index }){
    if(href !== '') return;

    eventBus.emit('openMenu', index);
}

function parentPath(){
    return route.path.split('/').slice(0, -1).join('/');
}
</script>
<style lang="scss" scoped>

</style>