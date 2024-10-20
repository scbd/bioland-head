<template>
    <NuxtLink :to="getHref(aLine)" :alt="aLine.title || aLine.name" :title="aLine.title || aLine.name" >
        <div   class="card p-1 mb-3"  >
            <div  class="row g-0">
                <div class="col-8 fw-bold"> {{t('Topic')}} </div>
                <div class="col-1 fw-bold"> {{t('Replies')}} </div>
                <div class="col-3 fw-bold"> {{t('Last Reply')}}</div>

                <div class="col-12">
                    <div class="card-header">
                        <hr class="my-0 mx-0 line" >
                    </div>
                </div>

                <div class="col-8">
                    <div class="card-body pe-1">
                        <h5 class="card-title">{{aLine.title || aLine.name}}</h5>
                        <p v-if="aLine.summary" class="card-text">{{aLine.summary}}...</p>

                    </div>
                </div>
                <div class="col-1">
                    <div class="card-body">
                        {{aLine?.count}}
                    </div>
                </div>
                <div class="col-3">
                    <div class="card-body">
                        <p>{{t('By')}} {{user?.displayName}}</p>
                        <p>{{aLine?.dateString}}</p>
                    </div>
                </div>
            </div>
        </div>
    </NuxtLink>
</template>
<script setup>
    const   localePath   = useLocalePath();
    const { t, locale  } = useI18n();
    const   props        = defineProps({  aLine: { type: Object  } });
    const { aLine }      = toRefs(props);

    function getHref(aLine){
        const   topic    = unref(aLine);
        const { nodeId } = topic;

        return locale.value === 'en'? localePath(topic.href) : localePath(`/node/${nodeId}`);
    }

    const user = computed(lastUser);

    function lastUser(){
        return aLine.value?.users?.find((u)=>u.uid === aLine.value?.lastCommentUid)
    }

</script>
<style scoped>
.line{
    border: 1px solid var(--bs-primary);
}
.card{
    background-color: #eee;
    border-left: 7px solid var(--bs-blue);
}
.card:hover{
    cursor: pointer !important;
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