<template>
    <div class="my-2" :class="{ 'mt-4 mb-3': isMobile }">
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


const { t  }    = useI18n();
const   props   = defineProps({ count: { type: Number } });
const { count } = toRefs(props);

const viewport   = useViewport();
const route      = useRoute();
const localePath = useLocalePath();
const pageStore  = usePageStore();
const contentTypeId = computed(()=> pageStore?.page?.fieldTypePlacement?.drupal_internal__tid);
const menusStore = useMenusStore();
const inMenu     = ref(menusStore.isInMainMenu(route.path) || menusStore.isInMainMenu(parentPath()) || menusStore.isInMainMenuByContentTypeId(contentTypeId.value));
const eventBus   = useEventBus();
const crumbs     = computed(()=> inMenu?.value? inMenu.value?.crumbs : []);
const isMobile   = computed(()=> ['md','sm','xs'].includes(viewport.breakpoint.value));

function isSelf(href){ return href === route.path; }

function openMenu({ href, index }){
    if(href !== '') return;

    eventBus.emit('openMenu', index);
}


function parentPath(){
    return route.path.split('/').slice(0, -1).join('/');
}

function makeCrumb(){

}

</script>
<style lang="scss" scoped>

</style>