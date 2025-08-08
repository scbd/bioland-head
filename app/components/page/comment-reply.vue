<template>
    <div  v-if="visible" class="w-100">
        <div class="p-1 d-inline-flex align-items-start w-100">
            <div class="mt-1"><LazyAvatar :user="reply.user" /></div>
            <div class="">
        
                <div class="reply rounded  ms-1 p-2 mb-0"  v-html="htmlSanitize(reply?.commentBody?.value)"></div> 
                <span v-if="!reply.status" class="badge bg-warning text-dark ms-2 me-1" >{{t('Waiting for Approval')}} </span>          
            </div>
            
        </div>
        <LazyFormReplyInput  :disabled="!reply.status" :reply="reply" :topRepliesVisible="repliesVisible"/> 
        
    </div>
</template>
<script setup>
    const { t }        = useI18n();
    const   meStore    = useMeStore();
    const   props                        = defineProps({ reply: { type: Object  }, repliesVisible: { type: Boolean, default: false } });
    const { reply, repliesVisible }      = toRefs(props);                         

    const isOwner      = computed(()=> reply.value?.user?.drupalInternalUid === meStore.diuid);
    const hasRoles     = computed(()=> meStore.isSiteManager || meStore.isSiteManager || meStore.isContentManager )

    const visible     = computed(()=> reply.value?.status || (isOwner.value ||  hasRoles.value));
</script>
<style scoped>
    .reply{

    background-color: #d3d3d3;
    }
    .reply-text{

    min-width:80%;
    }
    .nb{
    border: none;
    }
    .card{
        background-color: #eee;
        border-left: 7px solid var(--bs-blue);
    }
    .card:hover{
        /* cursor: pointer !important; */
        box-shadow:  0 10px 20px rgb(0 0 0 / 19%), 0 6px 6px rgb(0 0 0 / 23%) ;
        background-color: #e1e1e1;
    }
</style>