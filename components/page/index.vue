<template>
    <section>
        <LazyPageBody              v-if="pageStore.isPage"/>
        <LazyPageBodyMedia         v-if="pageStore.isMediaPage "/>  
        <LazyPageList              v-if="pageStore.isSearch"/>
        <LazyPageListForums        v-if="pageStore.isForumsList"/>
        <LazyPageListTopics        v-if="pageStore.isTopicsList" />
        <LazyPageListTopicComments v-if="pageStore.isTopicsCommentsList" /> 
        <LazyPageListNcps          v-if="pageStore.isNcpsList" />
        <LazyPageCustomChmNetwork  v-if="pageStore.isChmNetwork" />
    </section>
</template>

<script setup>


    const pageStore = usePageStore();
</script>