<template>
    <NuxtLink style="text-decoration: none;" :to="goTo(href)" prefetch-on="visibility" :alt="aLine.title || aLine.name" :title="aLine.title || aLine.name" :target="target" :external="external">
        <div :style="cardStyle" class="card p-1 mb-3" >
            <div  class="row g-0">
                <div v-if="aLine.sticky || aLine.promote" class="text-center position-absolute top-0">
                    <ClientOnly>
                        <Popper v-if="aLine.sticky" class="dark" :hover="true" :arrow="true" placement="bottom">
                            <LazyIcon  name="pushpin" :size="1.5"  />
                                <template #content>
                                    <div >
                                        <h5>{{t('Sticky')}}</h5>
                                        <p >{{t('stickyNote')}}</p>
                                    </div>
                                </template>
                        </Popper>
                    </ClientOnly>
                    <ClientOnly>
                        <Popper v-if="aLine.promote" class="dark" :hover="true" :arrow="true" placement="bottom">
                            <LazyIcon name="promote" :size="2" class="ms-3"/>
                                <template #content>
                                    <div >
                                        <h5>{{t('Promote')}}</h5>
                                        <p >{{t('promoteNote')}}</p>
                                    </div>
                                </template>
                        </Popper>
                    </ClientOnly>               
                </div>
                <div :class="{ 'col-9': aLine.mediaImage, 'col-12': !aLine.mediaImage, 'mt-2':aLine.sticky || aLine.promote }">
                    <div class="card-body pe-1">
                        <h5 class="card-title">{{aLine.title || aLine.name}}</h5>
                        <p v-if="aLine.summary" class="card-text">{{aLine.summary}}...</p>

                    </div>
                </div>
                <div v-if="aLine.mediaImage" class="col-md-3">
                    <NuxtImg  format="webp" loading="lazy" quality="25" class="img-fluid" :alt="aLine.mediaImage.alt" :src="aLine.mediaImage.src" :width="aLine.mediaImage.width" :height="aLine.mediaImage.height" />
                </div>
                <div class="col-12 ">
                    <div class="card-footer pb-0 text-center">
                        <ul class="float-start">
                            <li v-if="!isSingleType"><span :style="typeStyle" class="fw-bold text-uppercase">{{getDocumentTypeName(aLine)}}</span></li>
                            <li v-if="aLine?.tags?.countries?.length" v-for="(aCountry,i) in aLine.tags?.countries" :key="i"   class="text-uppercase" >
                                <NuxtLink :to="`https://www.cbd.int/countries/?country=${aCountry.identifier}`" target="_blank" external>
                                    {{t(aCountry.identifier)}}
                                </NuxtLink>
                            </li>
                        </ul>

                        <span v-if="aLine?.tags?.gbfTargets?.length" v-for="(aTarget,i) in aLine?.tags?.gbfTargets" :key="i"  >
                            <LazyGbfIcon :identifier="aTarget.identifier" size="xs" class="me-1"/>
                        </span>
                        <span v-if="aLine?.tags?.sdgs?.length" v-for="(aSdg,i) in aLine?.tags?.sdgs" :key="i"  >
                            <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                        </span>
                        <p class="float-end card-text pe-1"><small class="text-muted">{{getDateFormated()}}</small></p>
                    </div>
                    
                </div>
            </div>
        </div>
    </NuxtLink>
</template>
<script setup>
    import   Popper         from 'vue3-popper';

    const   siteStore                   = useSiteStore();
    const   localePath                  = useLocalePath();
    const   route                       = useRoute();
    const   type                        = route?.params?.type;
    const   drupalInternalIds           = route?.path?.includes('/media/photos-and-videos')? ['image', 'remote_video'] : undefined;
    const { contentTypes, mediaTypes }  = useMenusStore();
 
    const { t, locale  } = useI18n();
    const   dateFormat   = useDateFormat(locale);
    const   props        = defineProps({  aLine: { type: Object  }, });
    const { aLine }      = toRefs(props);

    const isChm         = computed(()=> aLine.value?.realms?.length);
    const isContentType = computed(()=>!!contentTypes[type]);
    const isDrupalType  = computed(()=> isContentType.value );
    const isSingleType  = computed(()=> (isDrupalType.value && !route?.query?.drupalInternalIds?.length && !drupalInternalIds?.length));

    const  href  = computed(()=> {
        const uri = aLine.value?.href || aLine.value?.urls[0];

        if(!uri) return'';
        if(uri.startsWith('https')) return uri;

        return getRealmHost()+uri;
    });

    const target   = computed(()=> isChm.value? '_blank' : '_self');
    const external = computed(()=> isChm.value? true : false);

    function goTo(path){
        if(!path) return 

        if(isChm.value) return path;

        return localePath(path);
    }

    function getDocumentTypeName(aLine){
        if(aLine?.fieldTypePlacement)
            return aLine.fieldTypePlacement.name;

        if(aLine?.type?.includes('media--'))
            return t(aLine.type.replace('media--',''),1);

        if(isChm.value) return t(aLine.schema) + ' - ' + getRealmText(aLine);
    }

    function getRealmText({ realms }){
        if(! realms || !realms.length) return '';

        const hasChm = realms.includes('CHM');
        const hasAbs = realms.includes('ABS');
        const hasBch = realms.includes('BCH');

        if(hasChm && hasAbs && hasBch) return t('Secretariat');

        if(hasChm && hasAbs) return t('Access and Benefit-sharing Clearing-House');

        if(hasChm && hasBch) return t('Biosafety Clearing-House');

        if(hasChm && realms.length == 1) return t('Secretariat');

        if( hasAbs && realms.length == 1) return t('Access and Benefit-sharing Clearing-House');

        if(hasBch && realms.length == 1) return t('Biosafety Clearing-House');
    }

    function getRealmHost(){
        const { realms } = aLine.value;
        if(! realms || !realms.length) return '';

        const hasChm = realms.includes('CHM');
        const hasAbs = realms.includes('ABS');
        const hasBch = realms.includes('BCH');

        if(hasChm && hasAbs && hasBch) return 'https://www.cbd.int';

        if(hasChm && hasAbs) return 'https://absch.cbd.int';

        if(hasChm && hasBch) return 'https://bch.cbd.int';

        if(hasChm && realms.length == 1) return 'https://www.cbd.int';
    }

    function getDateFormated(){
        const line = unref(aLine);

        if(isChm.value) return dateFormat(line.startDate || line.updatedDate )

        else
        return dateFormat(line.fieldStartDate || line.fieldPublishedDate || line.changed)
    }

    
    const cardStyle = reactive({
                                    'background-color': siteStore?.theme?.backGround?.secondary,
                                    'border-left'     : `7px solid ${siteStore?.primaryColor}`
                                })

    const typeStyle= reactive({ 'color': siteStore?.primaryColor })
</script>
<style scoped>
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
    display: inline-block;
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
</style>