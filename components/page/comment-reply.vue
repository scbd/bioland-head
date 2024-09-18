<template>
    <div class="w-100">
        <div class="p-1 d-inline-flex align-items-start w-100">
            <div class="mt-1"><Avatar :user="reply.user" /></div>
            <div class="">
                <div class="reply rounded  ms-1 p-2 mb-0"  v-html="reply?.commentBody?.value"></div>
                <!-- <div class="reply-text ms-1 mb-0 d-flex align-items-center">
                    <span class="ps-2 me-1 small text-muted text-capitalize">{{reply.dateString}}</span> 

                    <button  type="button" class="btn btn-outline-dark nb mx-1  text-capitalize btn-sm "><span class="text-small" style="font-weight: bold; letter-spacing: 0.075em;">{{ t('reply') }}</span></button>
                </div>
                <div v-if="reply.comments?.length" class="ms-1 mt-1 mb-0">
                    <button  type="button" class="btn btn-outline-dark nb  fs-5 font-weight-bold btn-sm"><span style="font-weight: bold; letter-spacing: 0.05em; "><span class="text-capitalize">{{ t('view') }}</span> <span v-if="count">{{ t('all') }}</span> <span>{{ count }}</span> <span>{{ t('reply', count) }}</span> </span></button>
                </div> -->
                
            </div>
            
        </div>
        <FormReplyInput :reply="reply" :topRepliesVisible="repliesVisible"/>
    </div>
</template>
<script setup>
    
    const   props        = defineProps({ reply: { type: Object  }, repliesVisible: { type: Boolean, default: false } });
    const { reply, repliesVisible }      = toRefs(props);
    const   count        = computed(()=> reply.value?.comments?.length || 0);                               


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