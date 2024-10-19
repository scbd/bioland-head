<template>
<div class="position-relative">
    <Spinner v-if="loading" :is-modal="true"/>
    <div v-if="!error && data?.length">
        <div class="text-capitalize">
            <h4 :style="style" class="bm-3">{{t('Latest Discussions')}} </h4>
        </div>
        <div v-for="(forum,i) in data || []" :key="i"  class="mb-4">
            <h5 class="card-title  mb-2">
                <NuxtLink :style="linkStyle" class="fw-bold"  :to="localePath(forum.href)">{{forum.title}}</NuxtLink>
            </h5>
            <div>
                <span v-for="(user,j) in forum?.users || []" :key="j" >
                    <Avatar :user="user" />
                </span>
            </div>
            <div class="mt-1">
                <span :style="bgStyle" class="badge  me-2">{{forum.forum.name}}</span>
                <span class="me-2">{{forum.dateString}}</span>
                <span>{{forum.count}} {{t('Replies')}}</span>
            </div>
        </div>
        <div class="mb-5">
            <div class="text-start my-3 mb-3">
                <NuxtLink :style="linkStyle" :to="localePath('/forums')" class=" fw-bold fs-5" >
                        {{t('Browse Discussions')}}
                </NuxtLink>
                &nbsp;
                <Icon name="arrow-right" class="arrow" />
            </div>
        </div>
    </div>
</div>
</template>
<script setup>
    import   clone          from 'lodash.clonedeep' ;

    const { t         , locale } = useI18n      ();
    const   localePath           = useLocalePath()
    const   siteStore            = useSiteStore ();

    const   query  = clone({...siteStore.params, rowsPerPage:5 });
    const { data, status, error } =  await useLazyFetch(`/api/list/topics`, {  method: 'GET', query });

    const loading   = computed(()=> status.value === 'pending');
    const style     = reactive({ '--bs-primary': siteStore.primaryColor })
    const linkStyle = reactive({ '--bs-primary': siteStore.primaryColor, color: siteStore.primaryColor, 'text-decoration': `underline ${siteStore.primaryColor}` })
    const bgStyle   = reactive({ 'background-color': siteStore.primaryColor })
</script>