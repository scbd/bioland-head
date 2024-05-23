<template>
    <nav v-if="showPaging" >
        <ul class="pagination justify-content-center">
            <li  @click.prevent="prevPage()" :class="{'disabled': prevDisabled}" class="page-item">
                <a :style="linkStyle" class="page-link" href="#" >{{t('Previous')}}</a>
            </li>
            <li  @click.prevent="changePage(aPage)" class="page-item" v-for="(aPage,index) in range" :key="index">
                <a :style="linkStyle" :class="{'disabled current':page === aPage}" class="page-link" href="#">
                    {{aPage}}
                </a>
            </li>
            <li  @click.prevent="nextPage()" :class="{ 'disabled': nextDisabled }" class="page-item">
                <a :style="linkStyle" class="page-link" href="#"> {{t('Next')}}</a>
            </li>
        </ul>
    </nav>
</template>
<i18n src="@/i18n/dist/components/page/list/pager.json"></i18n>
<script setup>

const { t  }      = useI18n();
const   props     = defineProps({ count: { type: Number } });
const { count }   = toRefs(props);
const   route     = useRoute();
const   eventBus  = useEventBus();
const   router    = useRouter();

const page        = computed(()=>route?.query?.page?  Number(route?.query?.page) : 1);
const rowsPerPage = computed(()=>route?.query?.rowsPerPage? Number(route?.query?.rowsPerPage):  10);

const totalPages   = computed(()=> Math.ceil((count.value || rowsPerPage.value) / rowsPerPage.value));
const showPaging   = computed(()=> totalPages.value > 1);
const prevDisabled = computed(()=> page.value === 1);
const nextDisabled = computed(()=> page.value === totalPages.value);

function nextPage(){
    if(nextDisabled.value) return;

    changePage(page.value + 1);
}

function prevPage(){
    if(prevDisabled.value) return;

    changePage(page.value - 1);
}

async function changePage(page){
    const query = { ...route.query, page };
    
    await router.push({ query });

    eventBus.emit('changePage');
}

const range = computed(()=> {
    if(totalPages.value <= 5 ) return Array.from(Array(totalPages.value).keys()).map(i => i + 1)
    if(page.value <=3) return Array.from(Array(5).keys()).map(i => i + 1)

    if(page.value >3 && page.value <= totalPages.value -2 ) return [page.value-2,page.value-1,page.value,page.value+1,page.value+2]

    if(page.value == totalPages.value -1 ) return [page.value-3,page.value-2,page.value-1,page.value,page.value+1]

    return [page.value-4,page.value-3,page.value-2,page.value-1,page.value]

});
const siteStore = useSiteStore();

const linkStyle = reactive({
        // 'color': `${siteStore?.primaryColor} !important`,
        // 'border-color': `${siteStore?.primaryColor} !important`,
    //     position: 'relative',
    // display: 'block',
    // padding: 'var(--bs-pagination-padding-y) var(--bs-pagination-padding-x)',
    // 'font-size': 'var(--bs-pagination-font-size)',
    // color: siteStore?.primaryColor,
    // 'background-color': 'var(--bs-pagination-bg)',
    // border: 'var(--bs-pagination-border-width) solid var(--bs-pagination-border-color)',
'--bs-pagination-bg': siteStore?.theme?.backGround?.secondary,
'--bs-pagination-border-color':siteStore?.primaryColor,
'--bs-pagination-disabled-border-color': siteStore?.primaryColor,
'    --bs-pagination-active-border-color': siteStore?.primaryColor,
    '--bs-pagination-hover-color': '#fff',
    '--bs-pagination-color': siteStore?.primaryColor,
    '--bs-pagination-hover-bg': siteStore?.primaryColor,
    '--bs-pagination-active-border-color': siteStore?.primaryColor,
    '--bs-pagination-color': siteStore?.primaryColor,
    '--bs-pagination-hover-border-color': siteStore?.primaryColor

});
</script>
<style lang="scss" scoped>
.current {
    z-index: 2;
    color: var(--bs-pagination-hover-color);
    text-decoration: none;
    background-color: var(--bs-pagination-hover-bg);
    border-color: var(--bs-pagination-hover-border-color);
}
.disabled {
    cursor:not-allowed;
}
</style>