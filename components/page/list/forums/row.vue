<template>
    <NuxtLink :to="getHref(aLine)" :alt="aLine.title || aLine.name" :title="aLine.title || aLine.name" >

        <div  class="card p-1 m-1 " :class="{'ms-3': isChild}"  :style="`border-left: 7px solid ${aLine.fieldColor};`" >
            <div  class="row g-0">
                <div class="col-7 fw-bold"> {{isContainer? t('Forum Container') : t('Forum')}}</div>
                <div class="col-1 fw-bold"> {{t('Topics')}}</div>
                <div class="col-1 fw-bold"> {{t('Comments')}} </div>
                <div class="col-3 fw-bold"> {{t('Last Comment')}}</div>

                <div class="col-12">
                    <div class="card-header">
                        <hr class="my-0 mx-0" :style="`border: 1px solid ${aLine.fieldColor};`">
                    </div>
                </div>

                <div class="col-7">
                    <div class="card-body pe-1">
                        <h5 class="card-title">{{aLine.title || aLine.name}}</h5>
                        <p v-if="aLine.summary" class="card-text">{{aLine.summary}}...</p>

                    </div>
                </div>
                <div class="col-1">
                    <div class="card-body">
                        {{aLine?.meta?.topics}}
                    </div>
                </div>
                <div class="col-1">
                    <div class="card-body">
                        {{aLine?.meta?.posts}}
                    </div>
                </div>
                <div class="col-3">
                    <div class="card-body">
                        <p>{{t('By')}} {{aLine?.meta?.user?.displayName}}</p>
                        <p>{{aLine?.meta?.lastTimeString}}</p>
                    </div>
                </div>

                <div v-if="hasChildren" class="col-12 card-footer" >

                        <LazyPageListForumsRow  :a-line="aChild" :is-child="true" v-for="(aChild,index) in children" :key="index" />

                
                </div>
            </div>
        </div>
    </NuxtLink>
</template>
<script setup>
    const { t, locale  } = useI18n();
    const   props        = defineProps({  aLine: { type: Object  }, isChild: { type: Boolean, default: false } });
    const { aLine, isChild }      = toRefs(props);
    const   localePath   = useLocalePath();
    const   isContainer  = computed(() => !!aLine.value?.forumContainer);
    const   hasChildren = computed(() => aLine.value?.children?.length);
    const   children    = computed(() => aLine.value?.children);

    function getHref(aLine){
        const   topic    = unref(aLine);
        const { drupalInternalTid } = topic;


        return  localePath(`/taxonomy/term/${drupalInternalTid}`);
    }
</script>
<style scoped>
.card-footer{
    background-color: #424040;
    border-top: 1px solid var(--bs-blue);

}
.pointer{
    cursor: pointer !important;
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
li:last-child{ border-right: none; }
li a{ color: #333; }
.icon{ fill:var(--bs-primary); }
</style>