<template>
    <div class="text-capitalize">
        <h4 class="bm-3">{{t('Latest Discussions')}} </h4>
    </div>
    <div v-for="(forum,i) in data || []" :key="i"  class="mb-4">
        <h5 class="card-title  mb-2">
            <!-- :to="forum.href" -->
            <NuxtLink class="text-primary fw-bold"  to="/">{{forum.title}}</NuxtLink>
        </h5>
        <div>
            <span v-for="(user,j) in forum?.users || []" :key="j" >
                <Avatar :user="user" />
            </span>
            
        </div>
        <div class="mt-1">
            <span class="badge bg-primary me-2">{{forum.forum.name}}</span>
            <span class="me-2">{{forum.dateString}}</span>
            <span>{{forum.count}} {{t('Replies')}}</span>
        </div>
    </div>

  </template>
<i18n src="@/i18n/dist/components/widget/index.json"></i18n>
  <script setup>

  import { useSiteStore } from '~/stores/site' ;
  const { t, locale } = useI18n();

  const siteStore = useSiteStore();




    const   query  = {...siteStore.params, rowsPerPage:5 };
    const { data } =  await useFetch(`/api/list/forums`, {  method: 'GET', query });

  </script>
  
  <style>


  </style>