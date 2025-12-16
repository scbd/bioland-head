<template>
    <div id="page-body-tabs-container" v-if="!hideTabsForRestrictedPage">
        <!-- System page warning for users without edit permissions -->
        <LazyPageBodySystemPageWarning />
        
        <div id="page-body-tabs" class="tabs mb-3">
            <ul id="page-body-tabs-nav" class="nav nav-tabs" >
            <li class="nav-item" id="page-body-tabs-view">
                <span id="page-body-tabs-view-label" :style="getStyle()" class="nav-link text-capitalize" :class="{ 'disabled-tab-view': isDisabledTab }" :title="isDisabledTab ? t('systemPageDisabled') : ''">{{t('View')}}</span> 
            </li>
            <li v-if="meStore.isContentManager || isContributorCanEdit" class="nav-item">
                <span v-if="isDisabledTab" id="page-body-tabs-edit-disabled" class="nav-link text-capitalize disabled-tab" :title="t('systemPageDisabled')">
                    {{t('Edit')}}
                </span>
                <NuxtLink v-else id="page-body-tabs-edit-link" :style="getStyleActive()" :to="editUrl" class="nav-link text-capitalize" external>
                    {{t('Edit')}}
                </NuxtLink>
            </li>
            <li v-if="meStore.isContentManager" class="nav-item">
                <span v-if="isDisabledTab" id="page-body-tabs-delete-disabled" class="nav-link text-capitalize disabled-tab" :title="t('systemPageDisabled')">
                    {{t('Delete')}}
                </span>
                <NuxtLink v-else id="page-body-tabs-delete-link" :style="getStyleActive()" :to="baseUrl+'/delete' " class="nav-link text-capitalize" external>
                    {{t('Delete')}}
                </NuxtLink>
            </li>
            <li v-if="meStore.isContentManager" class="nav-item">
                <span v-if="isDisabledTab" id="page-body-tabs-revisions-disabled" class="nav-link text-capitalize disabled-tab" :title="t('systemPageDisabled')">
                    {{t('Revisions')}}
                </span>
                <NuxtLink v-else id="page-body-tabs-revisions-link" :style="getStyleActive()" :to="baseUrl+'/revisions'+returnUrl " class="nav-link text-capitalize" external>
                    {{t('Revisions')}}
                </NuxtLink>
            </li>
            <li v-if="meStore.isContributor && pageStore?.isNodePage" class="nav-item">
                <span v-if="isDisabledTab" id="page-body-tabs-clone-disabled" class="nav-link text-capitalize disabled-tab" :title="t('systemPageDisabled')">
                    {{t('Clone')}}
                </span>
                <NuxtLink v-else id="page-body-tabs-clone-link" :style="getStyleActive()" :to="cloneUrl" class="nav-link text-capitalize" external>
                    {{t('Clone')}}
                </NuxtLink>
            </li>
            <li v-if="meStore.isContentManager" class="nav-item">
                <span v-if="isDisabledTab" id="page-body-tabs-translate-disabled" class="nav-link text-capitalize disabled-tab" :title="t('systemPageDisabled')">
                    {{t('Translate')}}
                </span>
                <NuxtLink v-else id="page-body-tabs-translate-link" :style="getStyleActive()" :to="baseUrl+'/translations'+returnUrl " class="nav-link text-capitalize" external>
                    {{t('Translate')}} 
                </NuxtLink>
            </li>
            <li v-if="(meStore.isSiteManager || meStore.isScbdStaff) && canAutoTranslate && !isRestrictedPage" class="nav-item">
                <NuxtLink id="page-body-tabs-auto-translate-link" :style="getStyleActive()" :to="baseUrl+'/auto-translate-form'+returnUrl " class="nav-link text-capitalize" external>
                    {{t('Auto Translate')}}
                </NuxtLink>
            </li>
        </ul>
        </div>
    </div>
</template>

<script setup>

    const { t  }       = useI18n();
    const   route      = useRoute();
    const   meStore    = useMeStore();
    const   pageStore  = usePageStore();
    const   siteStore  = useSiteStore();
    const   canAutoTranslate = computed(()=> siteStore?.config?.runTime?.theme?.canAutoTranslate);

    // Cookie to check if user chose to hide system page warning
    const hideWarningCookie = useCookie('hideSystemPageWarning', {
        default: () => false,
        watch: true
    });

    // System pages and content type pages have restricted editing
    const isRestrictedPage = computed(() => pageStore.isSystemPage || pageStore.isContentType);
    
    // Tabs should be disabled when it's a restricted page and user can't edit system pages
    const isDisabledTab = computed(() => isRestrictedPage.value && !meStore.canEditSystemPages);
    
    // Hide entire tabs component when alert is hidden and page is restricted for this user
    const hideTabsForRestrictedPage = computed(() => {
        const cookieHidden = hideWarningCookie.value === true || hideWarningCookie.value === 'true';
        return cookieHidden && isDisabledTab.value;
    });

    const returnUrl = computed(()=>`?returnUrl=${encodeURIComponent(route.path)}`);

    const baseUrl   = computed(()=>siteStore.localizedHost+getUrlComponent());

    const isContributor = computed(() => meStore?.roles?.includes('contributor') && meStore?.roles?.length == 1);

    const isContributorCanEdit = computed(() => isContributor.value && pageStore?.page?.uid?.meta?.drupal_internal__target_id === meStore?.diuid && !pageStore?.page?.status);

    const cloneUrl = computed(()=>siteStore.localizedHost+`/clone/${pageStore?.page?.drupalInternalNid}/quick_clone`);

    function getUrlComponent(){
        if(pageStore?.isMediaPage)    return `/media/${pageStore?.page?.drupalInternalMid}`;
        if(pageStore?.isTaxonomyPage || pageStore.isSystemPage) return `/taxonomy/term/${pageStore?.page?.drupalInternalTid}`;

        return `/node/${pageStore?.page?.drupalInternalNid}`;
    }
    
    const  editUrl = computed(()=>{
        if(isContributor.value &&  !isContributorCanEdit.value) 
            return siteStore.localizedHost+'/admin/content/unpublished';
        
        return baseUrl.value+'/edit'; 
    })


    function getStyleActive(){
        return reactive({
                            'z-index'        : 2,
                            'font-size'      : '1.2rem',
                            'text-decoration': 'none',
                            'border-color'   : 'black',
                            'border-bottom'  : `black solid 1px`
                        });
    }

    function getStyle(){
        return reactive({
                            'z-index'         : 2,
                            color             : 'white',
                            'font-size'       : '1.3rem',
                            'text-decoration' : 'none',
                            'background-color': siteStore.primaryColor,
                            'border-color'    : siteStore.primaryColor,
                            'border-bottom'   : `black solid 1px`
                        });
    }
</script>
<style lang="scss"  scoped>
    .nav-link{ color: black; }
    .nav-link:hover{
        color: black;
        background-color: grey;
    }
    .nav-link.disabled-tab,
    .nav-link.disabled-tab-view {
        color: #999 !important;
        background-color: #e9ecef !important;
        border-color: #dee2e6 !important;
        cursor: not-allowed;
        pointer-events: auto; // Keep pointer events for tooltip
        opacity: 0.65;
        
        &:hover {
            background-color: #e9ecef !important;
            color: #999 !important;
        }
    }
    .a{
        z-index: 2;
        color: white;
        text-decoration: none;
        background-color: #009edb;
        border-color: white;
        border-bottom: #009edb solid 1px;
    }
    .dropdown-menu{ background-color:  white; }
    .tabs{ width:100%; }
</style>
