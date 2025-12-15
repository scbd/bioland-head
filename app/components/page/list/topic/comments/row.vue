<template>
    <div :id="baseId" class="card p-1 mb-3" :style="`border-left: 7px solid ${aLine.fieldColor};`" >
        <div :id="`${baseId}-row`" class="row g-0">
            <div class="col-12">
                <div :id="`${baseId}-header`" class="card-header">
                    <LazyAvatar :user="aLine.user" />
                    <span :id="`${baseId}-user`" class="text-muted ms-2">{{aLine.user.displayName}}</span>
                    <hr class="my-0 mx-0 mt-1" :style="`border: 1px solid ${aLine.fieldColor};`">
                </div>
            </div>

            <div class="col-12">
                <div :id="`${baseId}-body`" class="card-body">
                    <div :id="`${baseId}-body-html`" v-html="htmlSanitize(aLine.commentBody.value)"></div>
                </div>
            </div>

            <div class="col-12">
                <div :id="`${baseId}-footer`" class="card-footer">
                    <LazyFormCommentInput :id="`${baseId}-reply-input`" />
                </div>
            </div>
        </div>
    </div>
</template>
<script setup>
    const attrs = useAttrs();
    const baseId = computed(() => {
        if (attrs?.id) return String(attrs.id);

        const line = unref(aLine);
        const key = line?.id || line?.commentId;

        return key ? `page-list-topic-comment-${key}` : 'page-list-topic-comment';
    });

    const   props     = defineProps({  aLine: { type: Object  } });
    const { aLine }   = toRefs(props);
    
</script>
<style scoped>
.card{
    background-color: #eee;
    border-left: 7px solid var(--bs-blue);
}
.card:hover{
    box-shadow:  0 10px 20px rgb(0 0 0 / 19%), 0 6px 6px rgb(0 0 0 / 23%) ;
    background-color: #e1e1e1;
}

ul{
    display: inline-block;
    list-style-type: disc;
    margin-block-start: 0px;
    margin-block-end: 0px;
    margin-inline-start: 0px;
    margin-inline-end: 0px;
    padding-inline-start: 0px;
}
li{
    display: inline;
    margin: .2rem;
    padding: 0;
    border-right: solid 1px #999;
    padding-right: .5rem;
}
li:last-child{
    border-right: none;
}
li a{
    color: #333;
}

.icon{
    fill:var(--bs-primary);
}

</style>
