<template>
    <div class="position-relative">
        <!-- Placeholder shown during SSR and loading -->
        <template v-if="showWidget && (!hasHydrated || loading) && !error">
            <div class="text-capitalize placeholder-glow">
                <h4 class="bm-3"><span class="placeholder col-6"></span></h4>
            </div>
            <!-- Forum item placeholder 1 -->
            <div class="mb-4">
                <h5 class="card-title mb-2 placeholder-glow">
                    <span class="placeholder col-5"></span>
                </h5>
                <div>
                    <span class="placeholder rounded-circle me-1" style="width:32px;height:32px;display:inline-block;"></span>
                </div>
                <div class="mt-1 placeholder-glow">
                    <span class="badge bg-secondary placeholder me-2" style="width:100px;">&nbsp;</span>
                    <span class="placeholder col-1 me-2"></span>
                    <span class="placeholder col-3"></span>
                </div>
            </div>
            <!-- Forum item placeholder 2 -->
            <div class="mb-4">
                <h5 class="card-title mb-2 placeholder-glow">
                    <span class="placeholder col-6"></span>
                </h5>
                <div>
                    <span class="placeholder rounded-circle me-1" style="width:32px;height:32px;display:inline-block;"></span>
                </div>
                <div class="mt-1 placeholder-glow">
                    <span class="badge bg-secondary placeholder me-2" style="width:90px;">&nbsp;</span>
                    <span class="placeholder col-1 me-2"></span>
                    <span class="placeholder col-3"></span>
                </div>
            </div>
            <!-- Forum item placeholder 3 -->
            <div class="mb-4">
                <h5 class="card-title mb-2 placeholder-glow">
                    <span class="placeholder col-4"></span>
                </h5>
                <div>
                    <span class="placeholder rounded-circle me-1" style="width:32px;height:32px;display:inline-block;"></span>
                </div>
                <div class="mt-1 placeholder-glow">
                    <span class="badge bg-secondary placeholder me-2" style="width:150px;">&nbsp;</span>
                    <span class="placeholder col-1 me-2"></span>
                    <span class="placeholder col-3"></span>
                </div>
            </div>
            <!-- Browse link placeholder -->
            <div class="mb-5">
                <div class="text-start my-3 mb-3 placeholder-glow">
                    <span class="placeholder col-5"></span>
                </div>
            </div>
        </template>

        <!-- Actual content after hydration and data loads -->
        <div v-else-if="!error && data?.length && showWidget">
            <div class="text-capitalize">
                <h4 :style="style" class="bm-3">{{t('Latest Discussions')}} </h4>
            </div>
            <div v-for="(forum,i) in data || []" :key="i"  class="mb-4">
                <h5 class="card-title  mb-2">
                    <NuxtLink :style="linkStyle" class="fw-bold"  :to="getHref(forum)">{{forum.title}}</NuxtLink>
                </h5>
                <div>
                    <span v-for="(user,j) in forum?.users || []" :key="j" >
                        <LazyAvatar :user="user" />
                    </span>
                </div>
                <div class="mt-1">
                    <span :style="bgStyle" class="badge  me-2">{{forum.forum.name}}</span>
                    <span class="me-2">{{forum.dateString}}</span>
                    <span>{{forum.count}} {{t('Comments')}}</span>
                </div>
            </div>
            <div class="mb-5">
                <div class="text-start my-3 mb-3">
                    <NuxtLink :style="linkStyle" :to="forumsUrl" class=" fw-bold fs-5" >
                            {{t('Browse Discussions')}}
                    </NuxtLink>
                    &nbsp;
                    <LazyIcon name="arrow-right" class="arrow" />
                </div>
            </div>
        </div>
        <!-- Nothing shown on error (display:none behavior) -->
    </div>
</template>
<script setup>
    import   clone          from 'lodash.clonedeep' ;

    const   getCachedData  = useGetCachedData();
    const { t, locale  }   = useI18n();
    const   localePath     = useLocalePath();
    const   siteStore      = useSiteStore ();

    // Track if client has hydrated
    const hasHydrated = ref(false);
    onMounted(() => {
        hasHydrated.value = true;
    });

    const   showWidget     = computed(()=> !siteStore?.config?.hideHomePageWidgets?.forums);
    const   query                 = clone({...siteStore.params, rowsPerPage:5 });
    const { data, status, error } =  await useLazyFetch(`/api/list/topics`, {  method: 'GET', query,key: 'forums-widget', getCachedData });

    const forumsUrl = computed(() => localePath('/taxonomy/term/'+systemPageTidConstants.FORUMS));
    function getHref(topic){
        const { nodeId } = topic;

        return localePath(`/node/${nodeId}`);
    }

    const loading   = computed(()=> status.value === 'pending');
    const style     = reactive({ '--bs-primary': siteStore.primaryColor })
    const linkStyle = reactive({ '--bs-primary': siteStore.primaryColor, color: siteStore.primaryColor, 'text-decoration': `underline ${siteStore.primaryColor}` })
    const bgStyle   = reactive({ 'background-color': siteStore.primaryColor })
</script>