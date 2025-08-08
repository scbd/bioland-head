<template>
    <div  v-if="visible" class="card p-1 mb-3" :style="`border-left: 7px solid ${comment.fieldColor};`" >
        <div  class="row g-0">
            <div class="col-12">
                <div class="card-header">
                    <LazyAvatar :user="comment.user" />
                    <span class="text-muted ms-2">{{comment.user.displayName}}</span>
                    <span class="float-end me-2">{{comment.dateString}}</span>&nbsp;
                    <span v-if="!comment.status" class="badge bg-warning text-dark" style="margin-left:25%">{{t('Waiting for Approval')}} </span>
                    <hr  class="my-0 mx-0 mt-1" :style="`border: 1px solid ${comment.fieldColor};`">
                </div>
            </div>

            <div class="col-12">
                <div class="card-body">

                    <div v-html="htmlSanitize(comment.commentBody.value)"></div>
                    
                </div>
            </div>

            <div  class="col-12 card-footer">

                <LazyFormCommentInput  :disabled="!comment.status" :reply-type="comment.type" :reply-identifier="comment.id" :count="count" :replies="comment.comments"/>
            </div>
        </div>
    </div>
</template>

<script setup>

    const { t }        = useI18n();
    const   meStore    = useMeStore();
    const   props      = defineProps({ comment: { type: Object  } });
    const { comment }  = toRefs(props);
    const   count      = computed(()=> comment.value?.comments.filter(({status})=>status)?.length || 0);


    const isOwner      = computed(()=> comment.value?.user?.drupalInternalUid === meStore.diuid);
    const hasRoles     = computed(()=> meStore.isSiteManager || meStore.isSiteManager || meStore.isContentManager )

    const visible     = computed(()=> comment.value?.status || (isOwner.value ||  hasRoles.value));

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