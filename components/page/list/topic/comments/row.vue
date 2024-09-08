<template>
    <div   class="card p-1 mb-3" :style="`border-left: 7px solid ${aLine.fieldColor};`" >
        <div  class="row g-0">
            <div class="col-12">
                <div class="card-header">
                    <Avatar :user="aLine.user" />
                    <span class="text-muted ms-2">{{aLine.user.displayName}}</span>
                    <hr class="my-0 mx-0 mt-1" :style="`border: 1px solid ${aLine.fieldColor};`">
                </div>
            </div>

            <div class="col-12">
                <div class="card-body">

                    <div v-html="aLine.commentBody.value"></div>
                </div>
            </div>

            <div class="col-12">
                <div class="card-footer">
                    <span>{{aLine.dateString}}</span>&nbsp;
                    <a href="#">{{t('Reply')}}</a>
                </div>
            </div>
        </div>
    </div>
</template>
<script setup>
    import { DateTime     } from 'luxon';
    import { useMenusStore } from '~/stores/menus';

    const   route                       = useRoute();
    const   type                        = route?.params?.type;
    const   drupalInternalIds           = route?.path?.includes('/media/photos-and-videos')? ['image', 'remote_video'] : undefined
    const { contentTypes, mediaTypes }  = useMenusStore();
 
    const { t, locale  } = useI18n();
    const   props     = defineProps({ 
                                        aLine: { type: Object  },
                                    });
    const { aLine }   = toRefs(props);

    const isChm         = computed(()=> aLine.value?.realms?.length);
    const isContentType = computed(()=>!!contentTypes[type]);
    // const isMediaType   = computed(()=> drupalInternalIds?.length || !!mediaTypes[type]);
    const isDrupalType  = computed(()=> isContentType.value );


    const  href  = computed(()=> {

        const uri = aLine.value?.path.alias//aLine.value?.path?.alias || aLine.value?.url;

        return uri;


    });

    async function goTo(path){
        if(!path) return 

        const localePath = useLocalePath();

        await navigateTo({ path: localePath(path) })
    }




    function dateFormat(date){

        return DateTime.fromISO(date)
                .setLocale(locale.value)
                .toFormat('dd LLL yyyy HH:mm');
    }
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