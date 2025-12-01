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
                <NuxtLink :style="style" @click="(event)=>openMenu(aCrumb, event)" v-if="!isSelf(aCrumb.href)" :to="aCrumb.href? localePath(aCrumb.href) : '#'"  >
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
    const { style, badgePrimaryStyle } = useTheme();
    const { t, locale }    = useI18n();
    const   props          = defineProps({ count: { type: Number } });
    const { count }        = toRefs(props);
    const   isMobile       = isMobileFn();
    const   route          = useRoute();
    const   localePath     = useLocalePath();
    const   pageStore      = usePageStore();
    const   contentTypeId  = computed(()=> pageStore?.typeId);
    const   menusStore     = useMenusStore();
    const   isInDynamicMenu = computed(()=> menusStore.isInDynamicContentMenu(pageStore.page.drupalInternalNid,contentTypeId.value, locale));

    const   inMenu        = ref(menusStore.isInMainMenu(route.path) || menusStore.isInMainMenu(parentPath()) );//|| menusStore.isInMainMenuByContentTypeId(contentTypeId.value)
    const   eventBus      = useEventBus();
    const   crumbs        = computed(makeCrumb);
    const { showBl1Link } = useRuntimeConfig().public;
    const { schemaOnly } = route?.query || {};

    function isSelf(href){ return href === route.path; };

    function openMenu({ href, index }, event){
        if(href !== '') return;

        event.preventDefault();
        eventBus.emit('openMenu', index);
    }

    function parentPath(){
        return route.path.split('/').slice(0, -1).join('/');
    }

    function makeCrumb(){

        if(pageStore?.isSystemPage && systemPageTidConstants.SEARCH_SEC && schemaOnly) {
            return [
                {
                    title: t('Search Secretariat'),
                    href: `/taxonomy/term/${systemPageTidConstants.SEARCH_SEC}`,
                }
            ];
        }
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

        // Content type based breadcrumbs
        const contentType = menusStore.getContentTypeById(contentTypeId.value, locale.value);

        if(!contentType) return [];

        // Find the menu entry for this content type in the main menu
        const menuEntry = menusStore.isInMainMenuByContentTypeId(contentTypeId.value);

        // 1. If content type is not in any main menu, just show
        //    "National CHM > <ContentType>" and link to the listing.
        if(!menuEntry || !Array.isArray(menuEntry.crumbs) || !menuEntry.crumbs.length){
            return [
                {
                    title: contentType?.plural,
                    href: contentType?.slug,
                }
            ];
        }

        // 2. If it is under a main menu child (e.g. Resources), build
        //    full path: National CHM > Resources > Photos & Videos.
        //
        //    - The first crumb (Resources) should only open the
        //      mega-menu (no navigation), so we force href to ''.
        //    - The content type crumb (Photos & Videos) should
        //      navigate to /<locale>/<contentTypeSlug>.
        const normalizedCrumbs = menuEntry.crumbs.map((crumb, index) => {
            const newCrumb = { ...crumb };

            if(index === 0){
                // Root menu item: open mega-menu only
                newCrumb.href = '';
            }

            if(newCrumb.contentTypeId === contentTypeId.value){
                // Ensure CT crumb links to the listing path
                newCrumb.href = contentType?.slug || newCrumb.href || '';
            }

            return newCrumb;
        });

        return normalizedCrumbs;
    }
    


    const showMigratedLInk  = computed(()=> pageStore?.page?.fieldMigrated && showBl1Link );
</script>
<style scoped>
a{
    color: var(--bs-primary);
}
</style>