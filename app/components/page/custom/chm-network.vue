<template>

    <div class="container page-body">
        <div  class="row">
            <div   class="col-md-3 d-lg-block"> &nbsp; </div>

            <div  class="col-12 col-md-9">
                <LazyPageBreadCrumbs/>
            </div>

            <div  class="col-12 d-md-none">
                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>
            </div>

            <div  class="col-3 d-none d-md-block">

                <h2 :style="pageTypeStyle" class="page-type">{{pageStore?.typeName}}</h2>


  
            </div>

            <div  class="col-12 col-md-9">
                <LazyPageBodyTabs />
                <h2  class="data-body mb-0" :class="{'has-hero': pageStore?.heroImage}" >{{ pageStore?.title}}</h2>

                <div v-if="pageStore?.page?.fieldUrl?.length" v-for="url in pageStore?.page?.fieldUrl"  >
                    <NuxtLink :style="pageTypeStyle" :to="url?.uri" target="_blank" class="fs-5" external :alt="url?.title">{{url.uri}} <span v-if="false">- {{url?.title}}</span> </NuxtLink>
                </div>

                <hr class="mt-1">


                <div class="d-md-flex"  >
                    <div class="align-self-start w-100">
                        <div :style="pageTypeStyle" v-if="pageStore?.body" v-html="htmlSanitize(pageStore?.body)"></div>

                        <LazyWidgetChmNetwork/>
                        <!-- <div  class="tabs">
                            <ul  class="nav nav-tabs" >
                                <li   class="nav-item " id="page-view">
                                    <span :style="getStyle()"  class="nav-link  text-capitalize" >{{t('View')}}</span> 
                                </li>
                                <li   class="nav-item ">
                                    <NuxtLink :style="getStyleActive()" :to="baseUrl+'/edit'+returnUrl " class="nav-link  text-capitalize"  >
                                        {{t('Edit')}}
                                    </NuxtLink>
                                </li>
                                <li   class="nav-item ">
                                    <NuxtLink :style="getStyleActive()" :to="baseUrl+'/delete' " class="nav-link  text-capitalize"  >
                                        {{t('Delete')}}
                                    </NuxtLink>
                                </li>
                                <li   class="nav-item ">
                                    <NuxtLink :style="getStyleActive()" :to="baseUrl+'/revisions'+returnUrl " class="nav-link  text-capitalize"  >
                                        {{t('Revisions')}}
                                    </NuxtLink>
                                </li>
                                <li   class="nav-item ">
                                    <NuxtLink :style="getStyleActive()" :to="baseUrl+'/translations'+returnUrl " class="nav-link  text-capitalize"  >
                                        {{t('Translate')}}
                                    </NuxtLink>
                                </li>
                            </ul>
                        </div> -->
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>



<script setup>



    const { t  }    = useI18n();
    const route     = useRoute();
    const pageStore = usePageStore();
    const siteStore = useSiteStore();
    const { pageTypeStyle } = useTheme();

    function getUrlComponent(){
        if(pageStore?.isMediaPage)    return `/media/${pageStore?.page?.drupalInternalMid}`;
        if(pageStore?.isTaxonomyPage) return `/taxonomy/term/${pageStore?.page?.drupalInternalTid}`;

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
    .page-body{
    min-height: 60vh;
}
.data-body{

    padding-left: 0;
    border-top: black .5rem solid;
    padding-top: 1rem;

}
.has-hero{
        font-size: 1.2rem;
    }
.page-type{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
    color: var(--bs-primary);
}
.side-heading{
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
}
</style>