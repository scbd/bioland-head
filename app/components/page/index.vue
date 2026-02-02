<template>
    <section>
        <LazyPageBody              v-if="pageStore.isInitialized && pageStore.isPage"/>
        <LazyPageBodyMedia         v-if="pageStore.isInitialized && pageStore.isMediaPage"/>  
        <LazyPageList              v-if="pageStore.isInitialized && pageStore.isSearch"/>
        <LazyPageListForums        v-if="pageStore.isInitialized && pageStore.isForumsList"/>
        <LazyPageListTopics        v-if="pageStore.isInitialized && pageStore.isTopicsList" />
        <LazyPageListTopicComments v-if="pageStore.isInitialized && pageStore.isTopicsCommentsList" /> 
        <LazyPageListNcps          v-if="pageStore.isInitialized && pageStore.isNcpsList" />
        <LazyPageCustomChmNetwork  v-if="pageStore.isInitialized && pageStore.isChmNetwork" />
        <LazyPageCustomDevelopment v-if="pageStore.isInitialized && pageStore.isSystemPageDev" />
    </section>
</template>

<script setup>
    const pageStore = usePageStore();
</script>