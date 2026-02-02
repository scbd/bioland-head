<template>
    <NuxtLink :id="baseId" style="text-decoration: none;" :to="goTo(href)" prefetch-on="visibility" :alt="aLine.title || aLine.name" :title="aLine.title || aLine.name" :target="target" :external="external">
        <div :id="`${baseId}-card`" :style="cardStyle" class="card p-1 mb-3" >
            <div  class="row g-0">
                <div v-if="(aLine.sticky || aLine.promote) && siteStore.isPromoteAndStickyPublic" :id="`${baseId}-flags`" class="text-center position-absolute top-0">
                    <ClientOnly>
                        <Popper v-if="aLine.sticky " :id="`${baseId}-sticky-indicator`" class="dark" :hover="true" :arrow="true" placement="bottom">
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
                        <Popper v-if="aLine.promote" :id="`${baseId}-promote-indicator`" class="dark" :hover="true" :arrow="true" placement="bottom">
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
                <div :id="`${baseId}-content`" :class="{ 'col-9': aLine.mediaImage, 'col-12': !aLine.mediaImage, 'mt-2':aLine.sticky || aLine.promote }">
                    <div :id="`${baseId}-body`" class="card-body pe-1">
                        <h5 :id="`${baseId}-title`" class="card-title">{{smartTruncate(aLine.title || aLine.name, 200, locale)}}</h5>
                        <p v-if="aLine.summary" :id="`${baseId}-summary`" class="card-text">{{smartTruncate(aLine.summary, 500, locale)}}</p>

                    </div>
                </div>
                <div v-if="aLine.mediaImage" :id="`${baseId}-media`" class="col-md-3">
                    <NuxtImg  :id="`${baseId}-media-image`" format="webp" loading="lazy" quality="25" class="img-fluid" :alt="aLine.mediaImage.alt" :src="aLine.mediaImage.src" :width="aLine.mediaImage.width" :height="aLine.mediaImage.height" />
                </div>
                <div :id="`${baseId}-footer-container`" class="col-12 ">
                    <div :id="`${baseId}-footer`" class="card-footer pb-0 text-center">
                        <ul :id="`${baseId}-tags`" class="float-start">
                            <li v-if="!isSingleType"><span :style="typeStyle" :id="`${baseId}-type`" class="fw-bold text-uppercase">{{getDocumentTypeName(aLine)}}</span><template v-if="getRealmText(aLine)"> - <span :style="getRealmStyle(aLine)" :id="`${baseId}-realm`" class="fw-bold text-uppercase">{{getRealmText(aLine)}}</span></template></li>
                            <li v-if="aLine?.tags?.countries?.length" v-for="(aCountry,i) in aLine.tags?.countries" :id="`${baseId}-country-${i}`" :key="i"   class="text-uppercase" >
                                <NuxtLink :to="`https://www.cbd.int/countries/?country=${aCountry.identifier}`" target="_blank" external :id="`${baseId}-country-link-${i}`">
                                    {{t(aCountry.identifier)}}
                                </NuxtLink>
                            </li>
                        </ul>

                        <span v-if="aLine?.tags?.gbfTargets?.length" v-for="(aTarget,i) in aLine?.tags?.gbfTargets" :id="`${baseId}-gbf-target-${i}`" :key="i"  >
                            <LazyGbfIcon :identifier="aTarget.identifier" size="xs" class="me-1" :id="`${baseId}-gbf-icon-${i}`"/>
                        </span>
                        <span v-if="aLine?.tags?.sdgs?.length" v-for="(aSdg,i) in aLine?.tags?.sdgs" :id="`${baseId}-sdg-${i}`" :key="i"  >
                            <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1" :id="`${baseId}-sdg-image-${i}`"/>
                        </span>
                        <p :id="`${baseId}-date`" class="float-end card-text pe-1">
                            <small v-if="isPublishedDate" class="text-muted text-uppercase">{{t('published on')}} : </small>
                            <small v-if="isStartDate" class="text-muted text-uppercase">{{t('start date')}} : </small>
                            <span >{{getDateFormated()}}</span>
                        </p>
            
                        <span  v-for="(subject,i) in aLine.tags?.subjects" :id="`${baseId}-subject-${i}`" :key="i" :style="bgStyle" class="badge text-bg-primary">{{ t(subject.identifier) }}</span>
                

                        <span  v-for="(bchSubject,i) in aLine.tags?.bchSubjects" :id="`${baseId}-bch-subject-${i}`" :key="i" :style="bgStyle" class="badge text-bg-primary text-white me-1">{{ t(bchSubject.identifier) }}</span>

                    </div>
                </div>
            </div>
        </div>
    </NuxtLink>
</template>
<script setup>
    import   Popper         from 'vue3-popper';

    const attrs = useAttrs();
    const baseId = computed(() => {
        if (attrs?.id) return String(attrs.id);

        const line = unref(aLine);
        const key = line?.id || line?.dnid || line?.nodeId;

        return key ? `page-list-row-${key}` : 'page-list-row';
    });

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
    const { bgStyle }    = useTheme();
    const { smartTruncate } = useText();

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

        // Guard against undefined/empty schema to prevent i18n "Invalid arguments" error
        if (!aLine?.schema) {
            console.debug('[row.vue] getDocumentTypeName - missing schema', { 
                type: aLine?.type, 
                dnid: aLine?.dnid,
                title: aLine?.title?.substring(0, 50)
            });
        }
        
        const schemaText = aLine?.schema ? t(aLine.schema) : '';
        
        // Return only schema text; realm text is now rendered separately with getRealmText
        if (schemaText) return schemaText;
        
        // Fallback for items without schema (e.g., forum nodes)
        return aLine?.type ? t(aLine.type.replace('node--', '')) : '';
    }

    function getRealmText({ realms }){
        if(! realms || !realms.length) return '';

        const hasChm = realms.includes('CHM');
        const hasAbs = realms.includes('ABS');
        const hasBch = realms.includes('BCH');
        const hasOrt = realms.includes('ORT');

        if(hasChm && hasAbs && hasBch) return t('Secretariat');

        if(hasChm && hasAbs) return t('Access and Benefit-sharing Clearing-House');

        if(hasChm && hasBch) return t('Biosafety Clearing-House');

        if(hasOrt) return t('Online Report Tool');


        if(hasChm && realms.length == 1) return t('Secretariat');

        if( hasAbs && realms.length == 1) return t('Access and Benefit-sharing Clearing-House');

        if(hasBch && realms.length == 1) return t('Biosafety Clearing-House');
    }

    function getRealmType({ realms }){
        if(! realms || !realms.length) return '';

        const hasChm = realms.includes('CHM');
        const hasAbs = realms.includes('ABS');
        const hasBch = realms.includes('BCH');

        if(hasChm && hasAbs && hasBch) return 'secretariat';
        if(hasChm && hasAbs) return 'absch';
        if(hasChm && hasBch) return 'bch';
        if(hasChm && realms.length == 1) return 'secretariat';
        if(hasAbs && realms.length == 1) return 'absch';
        if(hasBch && realms.length == 1) return 'bch';

        return '';
    }

    function getRealmStyle(aLine){
        const realmType = getRealmType(aLine);
        
        if(realmType === 'secretariat') return { color: '#1FA65D' };
        if(realmType === 'absch') return { color: '#fd7e14', 'text-decoration': 'underline', 'text-decoration-color': '#1FA65D', 'text-decoration-thickness': '0.5px' };
        if(realmType === 'bch') return { color: '#fd7e14' };
        
        return {};
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
        return dateFormat(line.fieldStartDate || line.fieldPublished || line.changed)
    }

    const isStartDate = computed(()=> !!(aLine?.value?.fieldStartDate || aLine?.value?.startDate));
    const isPublishedDate = computed(()=> !!(aLine?.value?.fieldPublished));
    const hasOrder = computed(()=> !!(aLine?.value?.fieldOrder) && (aLine?.value?.fieldOrder < 10000));
    
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
