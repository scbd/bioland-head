<template>
    <div class="w-100">
        <div class="p-1 d-inline-flex align-items-start w-100">
            <div class="mt-1"><LazyAvatar :user="reply.user" /></div>
            <div class="">
                <div class="reply rounded  ms-1 p-2 mb-0"  v-html="reply?.commentBody?.value"></div>           
            </div>
            
        </div>
        <LazyFormReplyInput :reply="reply" :topRepliesVisible="repliesVisible"/>
    </div>
</template>
<script setup>
    
    const   props                        = defineProps({ reply: { type: Object  }, repliesVisible: { type: Boolean, default: false } });
    const { reply, repliesVisible }      = toRefs(props);                         


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