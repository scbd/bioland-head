<template>
    <div   class="card p-1 mb-3" :style="`border-left: 7px solid ${comment.fieldColor};`" >
        <div  class="row g-0">
            <div class="col-12">
                <div class="card-header">
                    <Avatar :user="comment.user" />
                    <span class="text-muted ms-2">{{comment.user.displayName}}</span>
                    <span class="float-end me-2">{{comment.dateString}}</span>&nbsp;
            
                    <hr class="my-0 mx-0 mt-1" :style="`border: 1px solid ${comment.fieldColor};`">
                </div>
            </div>

            <div class="col-12">
                <div class="card-body">
                    <div v-html="comment.commentBody.value"></div>
                </div>
            </div>

            <div class="col-12 card-footer">
                <FormCommentInput  :reply-type="comment.type" :reply-identifier="comment.id" :count="count" :replies="comment.comments"/>
            </div>
        </div>
    </div>
</template>

<script setup>
    const   props      = defineProps({ comment: { type: Object  } });
    const { comment }  = toRefs(props);
    const count        = computed(()=> comment.value?.comments?.length || 0);                               
</script>

<style scoped>
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