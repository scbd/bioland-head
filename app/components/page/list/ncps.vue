<template>

    <div id="page-list-ncps-container" class="container page-body mb-5">
        <div id="page-list-ncps-header-row" class="row">
            <div id="page-list-ncps-sidebar-spacer"  class="col-md-3 d-lg-block"> &nbsp; </div>

            <div id="page-list-ncps-breadcrumbs-container" class="col-12 col-md-9 ps-0">
                <LazyPageBreadCrumbs/>
            </div>
            <div id="page-list-ncps-body-tabs-container" class="col-12 b-line">
                <LazyPageBodyTabs :can-edit="meStore.showEdit"/>
            </div>
            <div id="page-list-ncps-title-container" class="col-9 offset-3 b-line ps-0">
                <h1 id="page-list-ncps-title" class="d-flex align-items-center mt-2" >{{ pageStore?.title}}</h1>
                <LazySpinner v-if="loading" :size="100"/>
            </div>
            
        </div>

        <div v-for="(aType, typeIndex) in types" :id="`page-list-ncps-type-${aType}-${typeIndex}`" :key="typeIndex" class="row">
            <div :id="`page-list-ncps-type-${aType}-${typeIndex}-title-mobile-container`" class="col-12 d-md-none">
                <h2 :id="`page-list-ncps-type-${aType}-${typeIndex}-title-mobile`" :style="pageTypeStyle"  class="page-type">{{t(`${aType}-type`)}}</h2>
            </div>

            <div :id="`page-list-ncps-type-${aType}-${typeIndex}-title-desktop-container`" class="col-3 d-none d-md-block" >
                <h2  :id="`page-list-ncps-type-${aType}-${typeIndex}-title-desktop`" :style="pageTypeStyle" class="page-type pt-5">{{t(`${aType}-type`)}}</h2>
            </div>

            <div :id="`page-list-ncps-type-${aType}-${typeIndex}-content`" class="col-12 col-md-9 ps-0 pt-3 b-line">
                <div class="alert ps-0" v-for="(fp, fpIndex) in typesData[aType]" :id="`page-list-ncps-fp-${aType}-${fpIndex}`" :key="fpIndex" >
                    <h2 :id="`page-list-ncps-fp-${aType}-${fpIndex}-name`" class="mb-1">{{fp.title}}</h2>
                    <h4 :id="`page-list-ncps-fp-${aType}-${fpIndex}-type`">{{t(aType==='CBD'? 'CBD-FP1': aType)}}</h4>
                    <div :id="`page-list-ncps-fp-${aType}-${fpIndex}-details`" class="d-flex">
                        <div :id="`page-list-ncps-fp-${aType}-${fpIndex}-details-left`" class="d-flex flex-column w-75 ">
                        <span>{{fp.function}}</span>
                        <span>{{fp.department}}</span>
                        <span>{{fp.organization}}</span>
                        <span>{{fp.address}}</span>
                        <span>{{fp.addressCountry}}</span>
                        </div>
                        <div :id="`page-list-ncps-fp-${aType}-${fpIndex}-details-right`" class="d-flex flex-column w-25">
                            <span class="text-nowrap small" v-for="(phone, phoneIndex) in fp.telephones" :id="`page-list-ncps-fp-${aType}-${fpIndex}-phone-${phoneIndex}`" :key="phoneIndex">{{phone}} <br></span>
                            <span class="text-nowrap small" v-for="(email, emailIndex) in fp.emails" :id="`page-list-ncps-fp-${aType}-${fpIndex}-email-${emailIndex}`" :key="emailIndex">{{email}} <br></span>
                        </div>
                    </div>

                </div>
            </div>
 
            
        </div>

    </div>
</template>
<script setup>
import clone from 'lodash.clonedeep';

const { t }       = useI18n();
const   route     = useRoute();
const   meStore   = useMeStore();
const   pageStore = usePageStore();
const   siteStore = useSiteStore();

const pageTypeStyle = reactive({ '--bs-primary': siteStore.primaryColor });

const query = computed(() =>clone ({ ...route.query, ...siteStore.params }));

const { data, status } = await useLazyFetch(()=>`/api/list/contact-points`, {  method: 'GET', query });

const loading      = computed(()=> pageStore.loading || status.value === 'pending');
const contactTypes = [ 'CBD', 'CPB-FP1', 'ABS-FP', 'CHM-FP', 'BCH-FP', 'CPB-A17-FP', 'RM-FP', 'PA-FP', 'TKBD-FP', 'SBSTTA-FP', 'GTI-FP', 'GSPC-FP' ];

const types     = computed(computeTypes);
const typesData = computed(() => data.value[siteStore?.config?.country]);


function computeTypes(){
    if(!data?.value) return [];
    
    return contactTypes.filter((t)=>Object.keys(data.value[siteStore?.country || siteStore?.config?.country]).includes(t));
}
</script>

<style lang="scss" scoped>
.alert{
    color:rgba(0, 0, 0, 1);
    font-size: 1.3rem;  
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    &:last-child{
        border-bottom: none;
        }
    }
h4{
    font-size: 1.5rem;
    color:rgba(151, 151, 151, 1);
    border: none;
}
.page-body{
    min-height: 60vh;
}
.b-line{

border-bottom: black .5rem solid;

}
// .data-body{

//     padding-left: 0;
//     border-bottom: black .5rem solid;
//     padding-top: 1rem;

// }
// .has-hero{
//         font-size: 1.2rem;
//     }
.page-type{
    margin-top: -6px;
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;

}
// .side-heading{
//     padding-left: 0;
//     padding-top: 1rem;
//     border-top: var(--bs-primary) .5rem solid;
//     font-size: 2rem;
// }
</style>
