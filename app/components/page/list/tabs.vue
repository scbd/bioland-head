<template>
    <div v-if="showTabs" class="tabs">
        <ul  class="nav nav-tabs mb-1" >

            <li   class="nav-item ">
                <NuxtLink :style="getStyle(siteContentTo)"  :to="siteContentTo" class="nav-link  text-capitalize">
                    {{t('Site Content')}}
                </NuxtLink>
            </li>
            <li   class="nav-item ">
                <NuxtLink :style="getStyle(secretariatContentTo)" :to="secretariatContentTo" class="nav-link  text-capitalize">
                    {{t('Secretariat')}}
                </NuxtLink>
            </li>
            <li  v-if="siteStore.isBiosafetySite" class="nav-item ">
                <NuxtLink :style="getStyle(biosafetyContentTo)" :to="biosafetyContentTo" class="nav-link  text-capitalize">
                    {{t('Biosafety Clearing-House')}} 
                </NuxtLink>
            </li>
            <li  v-if="siteStore.isAbsSite" class="nav-item ">
                <NuxtLink :style="getStyle(accessBenefitContentTo)" :to="accessBenefitContentTo" class="nav-link  text-capitalize">
                    {{t('Access and Benefit-Sharing Clearing-House')}} 
                </NuxtLink>
            </li>
        </ul>
    </div>

</template>

<script setup>
    const { t, locale }     = useI18n();
    const localePath = useLocalePath();
    const siteStore  = useSiteStore();
    const pageStore  = usePageStore();
    const menusStore = useMenusStore();

    const tabObjects = computed(() => getTabObjects());

    const showTabs  = computed(()=>  (pageStore?.page?.children?.length || (pageStore?.page?.parent?.length && pageStore?.page?.parent[0].id !== 'virtual')));

    const siteContentTo        = computed(()=> getLocalizedPath(tabObjects.value.searchTab) || localePath(makeDrupalPathFromENtity(tabObjects.value.searchTab)));

    const secretariatContentTo = computed(()=> getLocalizedPath(tabObjects.value.searchSecTab) || localePath( makeDrupalPathFromENtity(tabObjects.value.searchSecTab)));
    const biosafetyContentTo   = computed(()=> getLocalizedPath(tabObjects.value.searchBchTab) || localePath( makeDrupalPathFromENtity(tabObjects.value.searchBchTab)));
    const accessBenefitContentTo   = computed(()=> getLocalizedPath(tabObjects.value.searchAbsTab) || localePath( makeDrupalPathFromENtity(tabObjects.value.searchAbsTab)));
    
    const isActive = (to) => localePath(pageStore?.path?.alias) === to || localePath(makeDrupalPathFromENtity(pageStore?.page)) === to;

    function getParentAlias(){
        if(!pageStore?.page?.parent?.length || pageStore?.page?.parent[0].id === 'virtual') return ''

        return localePath(pageStore?.page?.parent[0].path?.alias)
    }

    function getChildAlias(){
        if(!pageStore?.page?.children?.length) return ''

        return localePath(pageStore?.page?.children[0].path?.alias)
    }

    function getTabObjects(){
        const { SEARCH, SEARCH_SEC, SEARCH_BCH, SEARCH_ABS} = systemPageTidConstants;

        const tabKeyByTid = {
            [SEARCH]: 'searchTab',
            [SEARCH_SEC]: 'searchSecTab',
            [SEARCH_BCH]: 'searchBchTab',
            [SEARCH_ABS]: 'searchAbsTab'
        };

        const tabObjects = {
            searchTab: undefined,
            searchSecTab: undefined,
            searchBchTab: undefined,
            searchAbsTab: undefined
        };

        const visitedTids = new Set();

        function assignTab(node){
            if(!node || typeof node !== 'object') return;

            const tabKey = tabKeyByTid[node?.drupalInternalTid];

            if(tabKey && !tabObjects[tabKey])
                tabObjects[tabKey] = normalizeNode(node);
        }

        function normalizeNode(node){
            if(!node) return undefined;

            const currentLocale = locale?.value || 'en';
            const alias = node?.path?.alias || node?.aliases?.[currentLocale] || `/taxonomy/term/${node?.drupalInternalTid || ''}`;

            return {
                ...node,
                path: node?.path || { alias },
                parent: node?.parent || [],
                children: node?.children || []
            };
        }

        function traverse(node){
            if(!node || typeof node !== 'object') return;

            const tid = node?.drupalInternalTid;

            if(tid && visitedTids.has(tid)) return;
            if(tid) visitedTids.add(tid);

            assignTab(node);

            const parentNode = node?.parent?.[0];
            if(parentNode && parentNode.id !== 'virtual')
                traverse(parentNode);

            if(Array.isArray(node?.children))
                for(const childNode of node.children)
                    traverse(childNode);
        }

        traverse(pageStore?.page);

        const tabOrder = [SEARCH, SEARCH_SEC, SEARCH_BCH, SEARCH_ABS];
        const currentLocale = locale?.value || 'en';

        for (const tid of tabOrder){
            const tabKey = tabKeyByTid[tid];

            if(tabObjects[tabKey]) continue;

            const systemPage = menusStore.getSystemPageById(tid);

            if(systemPage){
                tabObjects[tabKey] = normalizeNode(systemPage);
                continue;
            }

            const fallbackAlias = menusStore.getSystemPagePath({ id: tid, locale: currentLocale }) || `/taxonomy/term/${tid}`;

            tabObjects[tabKey] = {
                drupalInternalTid: tid,
                path: { alias: fallbackAlias },
                parent: [],
                children: []
            };
        }

        return tabObjects;
    }

    function getLocalizedPath(taxonomyObject) {
        const { path, drupalInternalTid } = taxonomyObject || {};
        const currentLocale = locale?.value || 'en';
        
        if (!path?.alias || path?.langcode !== currentLocale)
            return localePath(`/taxonomy/term/${drupalInternalTid}`);
        
        return localePath(path.alias);
    }

//TODO put in theme composable
    function getStyle(link){
        if(!isActive(link)) return {}

        return reactive({
            'z-index': 2,
            color: 'white',
            'text-decoration': 'none',
            'background-color': siteStore.primaryColor,
            'border-color': 'white',
            'border-bottom': `${siteStore.primaryColor} solid 1px`
        })
    }
</script>
<style lang="scss"  scoped>
    .nav-link{
        color: black;
    }
    .a{
        z-index: 2;
        color: white;
        text-decoration: none;
        background-color: #009edb;
        border-color: white;
        border-bottom: #009edb solid 1px;
    }
    .dropdown-menu{
        background-color:  white;
    }
.tabs{
    width:100%;
}
</style>