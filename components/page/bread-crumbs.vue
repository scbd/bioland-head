<template>
    <div id="breadCrumbs" :style="style" class="d-flex justify-content-between my-1" :class="{ 'mt-4 mb-2 ': isMobile && !count, 'mt-4 mb-3 mx-3': isMobile && count }">
        <span class="align-self-center" id="breadCrumbLinks">
            <span class="text-nowrap">
                <NuxtLink :style="style" class="fw-bold" :to="localePath('/')">
                    {{t('National CHM')}}
                </NuxtLink>
                <span>&nbsp; <LazyIcon name="triangle-right"/> &nbsp;</span>
            </span>
            <span class="text-nowrap" v-for="(aCrumb,index) in crumbs" :key="index">
                <NuxtLink :style="style" @click="openMenu(aCrumb)" v-if="!isSelf(aCrumb.href)" :to="localePath(aCrumb.href)"  >
                    {{aCrumb.title}}
                </NuxtLink>
                <span v-if="!isSelf(aCrumb.href)">&nbsp; <LazyIcon name="triangle-right"/> &nbsp;</span>
            </span>
        </span>
        <span id="breadCrumbCount">
            <span v-if="count"  class="text-muted  float-end"> &nbsp; {{t('record', count)}}</span>
            <span v-if="count" :style="badgePrimaryStyle" class="badge rounded-pill  float-end" >{{count}}</span>
        </span>
        <span v-if="showMigratedLInk" class="align-self-center" id="breadCrumbControls">
            <NuxtLink  class="btn btn-outline-secondary btn-sm " :to="pageStore.migratedFromLink" target="_blank" :external="true">
                {{t('Bioland 1')}}  <LazyIcon name="external-link" :size="1.5"/>
            </NuxtLink>
        </span>

    </div>
</template>
<script setup>
    const { t }           = useI18n();
    const   props         = defineProps({ count: { type: Number } });
    const { count }       = toRefs(props);
    const   isMobile      = isMobileFn();
    const   route         = useRoute();
    const   localePath    = useLocalePath();
    const   pageStore     = usePageStore();
    const   contentTypeId = computed(()=> pageStore?.typeId);
    const   menusStore    = useMenusStore();
    const   inMenu        = ref(menusStore.isInMainMenu(route.path) || menusStore.isInMainMenu(parentPath()) || menusStore.isInMainMenuByContentTypeId(contentTypeId.value));
    const   eventBus      = useEventBus();
    const   crumbs        = computed(makeCrumb);
    const { showBl1Link } = useRuntimeConfig().public;

    function isSelf(href){ return href === route.path; };

    function openMenu({ href, index }){
        if(href !== '') return;

        eventBus.emit('openMenu', index);
    }

    function parentPath(){
        return route.path.split('/').slice(0, -1).join('/');
    }

    function makeCrumb(){
        if(!inMenu.value) return [];

<<<<<<<
        for (const aCrumb of inMenu.value?.crumbs ) 
            if(aCrumb?.contentTypeId && aCrumb?.href === '') aCrumb.href = menusStore.getContentTypeById(aCrumb.contentTypeId).slug;
        
        return inMenu.value?.crumbs;
=======
        if(pageStore?.isSystemPage || pageStore?.isContentType ) return [];

        if(pageStore.isTopicsList || pageStore.isTopicsCommentsList){
            const crumbs = [
                {
                    title: t('Forums'),
                    href: `/taxonomy/term/${systemPageTidConstants.FORUMS}`,
                }
            ]   

            const forum = pageStore?.page?.taxonomyForums 

            if(pageStore?.isSystemPage || !forum) return crumbs



            const name = forum?.name;
            // const { name, drupalInternalTid } = forum
            crumbs.push({
                title: name,
                href: `/taxonomy/term/${ forum?.tid || forum.drupal_internal__tid}`,
            });
            return crumbs
        }
        if(!isInDynamicMenu.value && pageStore.isNodePage){
            
            const contentType = menusStore.getContentTypeById(contentTypeId.value, locale.value);

            const crumbs = [
                {
                    title: contentType?.plural,
                    href: contentType?.slug,
                }
            ]   
            return crumbs
        } 
        else{

            return  menusStore.isInMainMenuByContentTypeId(contentTypeId.value)?.crumbs || [];

            for (const aCrumb of inMenu.value?.crumbs ) {
            
                if(!aCrumb ) continue;
                if(!(aCrumb?.contentTypeId && aCrumb?.href === '') ) continue;

                aCrumb.href = menusStore.getContentTypeById(aCrumb.contentTypeId).slug;
            }

            return inMenu.value?.crumbs;
        }
>>>>>>>
    }
    
    const { style, badgePrimaryStyle } = useTheme();

    const showMigratedLInk  = computed(()=> pageStore?.page?.fieldMigrated && showBl1Link );
</script>
<style scoped>
a{
    color: var(--bs-primary);
}
</style>