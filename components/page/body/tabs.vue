<template>
    <div  v-if="showSelf" class="tabs">
        <ul  class="nav nav-tabs" >
            <li   class="nav-item " id="page-view">
                <span :style="getStyle()"  class="nav-link  text-capitalize" >{{t('View')}}</span> 
            </li>
            <li   class="nav-item ">
                <NuxtLink :style="getStyleActive()" :to="baseUrl+'/edit'+returnUrl " class="nav-link  text-capitalize"  external>
                    {{t('Edit')}}
                </NuxtLink>
            </li>
            <li   class="nav-item ">
                <NuxtLink :style="getStyleActive()" :to="baseUrl+'/delete' " class="nav-link  text-capitalize"  external>
                    {{t('Delete')}}
                </NuxtLink>
            </li>
            <li   class="nav-item ">
                <NuxtLink :style="getStyleActive()" :to="baseUrl+'/revisions'+returnUrl " class="nav-link  text-capitalize"  external>
                    {{t('Revisions')}}
                </NuxtLink>
            </li>
            <li   class="nav-item ">
                <NuxtLink :style="getStyleActive()" :to="baseUrl+'/translations'+returnUrl " class="nav-link  text-capitalize" external  >
                    {{t('Translate')}}
                </NuxtLink>
            </li>
        </ul>
    </div>
</template>

<script setup>

    const { t  }    = useI18n();
    const route     = useRoute();
    const   meStore    = useMeStore();
    const   pageStore  = usePageStore();
    const siteStore = useSiteStore();

    const returnUrl = computed(()=>`?returnUrl=${encodeURIComponent(route.path)}`);

    const baseUrl   = computed(()=>siteStore.localizedHost+getUrlComponent());

    const showSelf = computed(() => pageStore?.isSystemPage? meStore?.showEditSystemPages : meStore?.showEdit)

    function getUrlComponent(){
        if(pageStore?.isMediaPage)    return `/media/${pageStore?.page?.drupalInternalMid}`;
        if(pageStore?.isTaxonomyPage || pageStore.isSystemPage) return `/taxonomy/term/${pageStore?.page?.drupalInternalTid}`;

        return `/node/${pageStore?.page?.drupalInternalNid}`;
    }
    
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