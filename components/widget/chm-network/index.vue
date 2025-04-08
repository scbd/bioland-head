<template>
    <div class="position-relative">
        <LazySpinner v-if="loading" :is-modal="true"/>
        <div v-if="!error ">
            <ul class="nav nav-pills">
                <li class="nav-item pointer" @click="clickTab('bl2')">
                    <span class="nav-link" :class="{active:tabs.bl2}" >Bioland 2 </span>
                </li>
                <!-- <li class="nav-item pointer" @click="clickTab('bl1')">
                    <span class="nav-link" :class="{active:tabs.bl1}" >Production Bioland 1</span>
                </li> -->

                <li v-if="meStore.isSiteManagerAndStaff" class="nav-item" @click="clickTab('stg')">
                    <span class="nav-link" :class="{active:tabs.stg}" >Staging</span>
                </li>

                <li v-if="meStore.isSiteManagerAndStaff" class="nav-item" @click="clickTab('dev')">
                    <span class="nav-link" :class="{active:tabs.dev}" >Development</span>
                </li>
            </ul>

<section>
    <LazyWidgetChmNetworkTable :sections="sections"/>
</section>

        </div>
    </div>
</template>
<script setup>
    import   clone          from 'lodash.clonedeep' ;

    const   meStore        = useMeStore();
    const   getCachedData  = useGetCachedData();
    const { t, locale  }   = useI18n();
    const   localePath     = useLocalePath();
    const   siteStore      = useSiteStore ();
    const   tabs           = ref({ bl2: true, bl1: false, staging: false, dev: false });

    const { data, status, error } =  await useLazyFetch(`/api/chm-network`, {  method: 'GET',key: 'chm-network-widget', getCachedData });


const activeTab = computed(() => {
    if (tabs.value.bl2) {
        return 'prod';
    } else if (tabs.value.bl1) {
        return 'bl1';
    } else if (tabs.value.stg) {
        return 'stg';
    } else if (tabs.value.dev) {
        return 'dev';
    }
    return 'bl2';
})
    const sections = computed(() => {
        const notPermitted = !(meStore.isAdmin || meStore.isSiteManagerAndStaff);
        const tempData     = notPermitted? [Object.values(data.value[activeTab.value])[0]] : Object.values(data.value[activeTab.value])

        return  tempData 
    });
   function clickTab(tab){
        tabs.value.bl2 = false;
        tabs.value.bl1 = false;
        tabs.value.stg = false;
        tabs.value.dev = false;

  
            tabs.value[tab] = true;

    }
    const forumsUrl = computed(() => localePath(systemPageTidConstants.FORUMS));
    function getHref(topic){
        const { nodeId } = topic;

        return localePath(`/node/${nodeId}`);
    }

    const loading   = computed(()=> status.value === 'pending');
    // const style     = reactive({ '--bs-primary': siteStore.primaryColor })
    // const linkStyle = reactive({ '--bs-primary': siteStore.primaryColor, color: siteStore.primaryColor, 'text-decoration': `underline ${siteStore.primaryColor}` })
    // const bgStyle   = reactive({ 'background-color': siteStore.primaryColor })
</script>