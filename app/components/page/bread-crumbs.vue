<template>
    <div id="breadCrumbs" :style="style" class="d-flex justify-content-between my-1 px-1" :class="{ 'mt-4 mb-2 ': isMobile && !count, 'mt-4 mb-3 mx-3': isMobile && count }">
        <span class="align-self-center" id="breadCrumbLinks">
            <span class="breadcrumb-segment">
                <NuxtLink :style="style" class="fw-bold" :to="localePath('/')">
                    {{t('National CHM')}}
                </NuxtLink>
                <span>&nbsp; <LazyIcon name="triangle-right"/> &nbsp;</span>
            </span>
            <span class="breadcrumb-segment" v-for="(aCrumb,index) in crumbs" :key="index">
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

    /**
     * Build breadcrumb entries from a menu entry, handling hierarchy synthesis
     * and normalization for both system pages and content type pages.
     * 
     * @param {object} menuEntry - The menu entry with crumbs/hierarchy
     * @param {object} options
     * @param {boolean} options.isListingPage - Whether this is a listing page (filters out self-crumb)
     * @param {number} [options.contentTypeId] - The content type ID to filter/link (for content type pages)
     * @param {object} [options.contentType] - The content type object with slug (for content type pages)
     * @returns {Array} The normalized breadcrumb entries
     */
    function buildCrumbsFromMenuEntry(menuEntry, { isListingPage, contentTypeId: ctId, contentType } = {}){
        // Use the stored crumbs, but if the menu entry only has a
        // single crumb (e.g. just "FAQs" or "Search"), synthesize the parent
        // main menu item (like "Resources") from the hierarchy so
        // breadcrumbs can render "National CHM > Resources > FAQs".
        let entryCrumbs = Array.isArray(menuEntry.crumbs)
            ? [ ...menuEntry.crumbs ]
            : [];

        if(entryCrumbs.length <= 1 && Array.isArray(menuEntry.hierarchy) && menuEntry.hierarchy.length){
            const topIndex = menuEntry.hierarchy[0];
            const parentMain = menusStore.main?.[topIndex];

            if(parentMain){
                const baseParentCrumb = Array.isArray(parentMain.crumbs) && parentMain.crumbs.length
                    ? parentMain.crumbs[0]
                    : null;

                const parentCrumb = baseParentCrumb || {
                    title: parentMain.title,
                    href: parentMain.href || '',
                    index: topIndex,
                    contentTypeId: parentMain.contentTypeId,
                    machineName: parentMain.machineName,
                };

                entryCrumbs.unshift(parentCrumb);
            }
        }

        if(!entryCrumbs.length) return [];

        // Filter crumbs based on page type:
        //  - On listing pages, we DO NOT include the crumb for the listing itself
        //    (only keep the parent main menu crumb).
        //  - On node pages, we keep all crumbs so users can jump back to the listing.
        // For system pages without a contentTypeId, we filter by matching href or title.
        const filteredCrumbs = isListingPage
            ? entryCrumbs.filter((crumb) => {
                // Filter by contentTypeId if provided
                if(ctId && crumb.contentTypeId === ctId) return false;
                // Filter by matching href for system pages (the last crumb is self)
                // Only filter if menuEntry has a non-empty href to compare
                if(!ctId && menuEntry.href && crumb.href === menuEntry.href) return false;
                // Also filter by title match for menu entries with empty href (custom components)
                if(!ctId && !menuEntry.href && crumb.title === menuEntry.title) return false;
                return true;
            })
            : entryCrumbs;

        if(!filteredCrumbs.length) return [];

        const normalizedCrumbs = filteredCrumbs.map((crumb, index) => {
            const newCrumb = { ...crumb };

            if(index === 0){
                // Root menu item: open mega-menu only
                newCrumb.href = '';
            }

            if(!isListingPage && ctId && newCrumb.contentTypeId === ctId){
                // Ensure CT crumb links to the listing path
                newCrumb.href = contentType?.slug || newCrumb.href || '';
            }

            return newCrumb;
        });

        return normalizedCrumbs;
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


        // For generic system pages, we do not show extra crumbs beyond
        // the root "National CHM". Content-type listing pages are
        // handled below via the contentTypeId, so we must NOT early
        // return for taxonomy_term--tags here.
        // However, if the system page IS in the main menu, we should
        // show breadcrumbs for it.
        if(pageStore?.isSystemPage){
            const systemPageTid = pageStore?.page?.drupalInternalTid;
            const menuEntry = menusStore.isInMainMenuBySystemPageTid(systemPageTid, locale.value);

            if (import.meta.dev) {
                console.log('[breadcrumbs] system page tid:', systemPageTid, 'menuEntry:', menuEntry);
            }

            if(!menuEntry) return [];

            // System page is in the menu - build crumbs from menu entry
            return buildCrumbsFromMenuEntry(menuEntry, { isListingPage: true });
        }

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

        // Content type based breadcrumbs. These behave slightly
        // differently for:
        //  - node pages (e.g. an individual FAQ): we DO show the
        //    content type crumb (FAQs) so users can jump to the
        //    listing page.
        //  - listing pages (taxonomy_term--tags such as /en/faqs,
        //    /en/contacts, /en/projects): we DO NOT show a crumb for
        //    the listing itself; we only show its parent main menu
        //    item (e.g. Resources) when available.
        const isListingPage = pageStore.isContentType;
        const contentType   = menusStore.getContentTypeById(contentTypeId.value, locale.value);

        if (import.meta.dev) {
            console.log('[breadcrumbs] locale:', locale.value, 'contentTypeId:', contentTypeId.value);
            console.log('[breadcrumbs] contentType found:', contentType);
            console.log('[breadcrumbs] contentTypes available:', Object.keys(menusStore.contentTypes).length, 
                        'langs:', [...new Set(Object.values(menusStore.contentTypes).map(ct => ct.langcode))]);
        }

        if(!contentType) return [];

        // Find the menu entry for this content type in the main menu
        const menuEntry = menusStore.isInMainMenuByContentTypeId(contentTypeId.value);

        if (import.meta.dev) {
            console.log('[breadcrumbs] menuEntry:', menuEntry, 'main menu length:', menusStore.main?.length);
        }

        // If the content type is not in any main menu:
        //  - on listing pages we show no extra crumb (only
        //    "National CHM").
        //  - on node pages we keep a single crumb that links back to
        //    the listing.
        if(!menuEntry){
            if(isListingPage) return [];

            if (import.meta.dev) {
                console.log('[breadcrumbs] no menuEntry, contentType:', contentType, 'plural:', contentType?.plural, 'slug:', contentType?.slug);
            }

            // Use plural name, fallback to singular name if plural is not available
            const title = contentType?.plural || contentType?.name;
            
            return [
                {
                    title,
                    href: contentType?.slug,
                }
            ];
        }

        // Build crumbs from menu entry using the shared helper
        const builtCrumbs = buildCrumbsFromMenuEntry(menuEntry, {
            isListingPage,
            contentTypeId: contentTypeId.value,
            contentType,
        });

        // If no crumbs from menu entry, fall back to content type crumb for node pages
        if(!builtCrumbs.length && !isListingPage){
            return [
                {
                    title: contentType?.plural,
                    href: contentType?.slug,
                }
            ];
        }

        return builtCrumbs;
    }
    


    const showMigratedLInk  = computed(()=> pageStore?.page?.fieldMigrated && showBl1Link );
</script>
<style scoped>
a{
    color: var(--bs-primary);
}

#breadCrumbs {
    flex-wrap: wrap;
    row-gap: 0.5rem;
}

#breadCrumbLinks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
}

.breadcrumb-segment {
    white-space: nowrap;
}

@media (max-width: 767.98px) {
    #breadCrumbLinks {
        flex-basis: 100%;
    }
}
</style>