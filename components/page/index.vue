<template>
    <LazyPageBody              v-if="pageStore.isPage"/>
    <LazyPageList              v-if="pageStore.isSearch"/>
    <LazyPageListForums        v-if="pageStore.isForumsList"/>
    <LazyPageListTopics        v-if="pageStore.isTopicsList" />
    <LazyPageListTopicComments v-if="pageStore.isTopicsCommentsList" /> 
</template>

<script setup>
//isTopicsList()
    const pageStore = usePageStore();
</script>