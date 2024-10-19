<template>
<div class="position-relative">
    <Spinner v-if="loading" :is-modal="true"/>
    <div >
        <div class="text-capitalize">
            <h4 :style="style"  >{{name}} </h4>
        </div>
        <div v-if="recordExists" class="card " >
            <h6 class="card-subtitle text-muted mb-1">{{type}}</h6>
            <ClientOnly>
                <div  v-if="hasImg" :style="backgroundStyles" class=" bg-light">
                    <NuxtLink  :to="goTo"   :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
                </div>
            </ClientOnly>
            <div class="card-body">
                
                <h5 class="card-title  mb-3">
                    <NuxtLink  class="text-primary fw-bold" :to="goTo"   :external="external" :target="external? '_blank': ''"><span :style="colorStyle">{{record.title}}</span></NuxtLink>
                </h5>
                <p class="card-text">{{trunc(record.summary)}}</p>

            </div>
            <div class="card-footer">
                <span v-if="record?.city" :style="bgStyle" class="badge me-1"> {{record.city}}</span>
                <span v-if="record?.country" class="badge bg-secondary me-1"> {{record.country}}</span>


                
                <NuxtLink  v-for="(aTarget,i) in record?.tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                    <GbfIcon :identifier="aTarget.identifier" size="xs"/>
                </NuxtLink>

                <NuxtLink  v-for="(aSdg,i) in record?.tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                    <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
                </NuxtLink>

                <span  :style="bgStyle" v-if="tags?.subjects?.length" v-for="(subject,i) in tags.subjects" :key="i" class="badge  me-1">{{subject.name}}</span>

                <span v-if="record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate" class="float-end card-subtitle text-nowrap text-muted text-small mt-1 mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate)}}</span>

            </div>
        </div>
        <div class="mb-5">
            <div v-for="(link,i) in links || []" :key="i" class="text-start  mb-3">
                <NuxtLink :to="link.to" class="text-decoration-underline  text-primary  fw-bold fs-5" :external="external">
                    <span :style="linkStyle">{{link.name}}</span>
                </NuxtLink>
                &nbsp;
                <Icon  v-if="!external" name="arrow-right" class="arrow" />
                <Icon  v-if="external" name="external-link" class="arrow" />
            </div>
        </div>
    </div>
</div>
</template>
<script setup>
    import { getGbfUrl    } from '~/util'        ;
    import { DateTime     } from 'luxon'         ;

    const { trunc  } = useText();
    const siteStore = useSiteStore();
    const   props       = defineProps({t: { type: String } , name: { type: String } , record: { type: Object }, links: { type: Array }, loading: { type: Boolean, default: false } });
    const { name, record, links, t:passedType, loading    } = toRefs(props);

    const recordExists = computed(()=> record?.value?.title)

    const { t, locale } = useI18n();

    const tags = computed(()=> record?.value?.tags);

    const external = computed(()=> {
        if(record?.value?.href?.startsWith('https://')) return true;
        if(record?.value?.realms?.length) return true;

        return false
    });

    const type = computed(()=> { 
        let  typeText = ''
        if(record?.value?.fieldTypePlacement?.name) 
            return  record?.value?.fieldTypePlacement?.name;


        if(record?.value?.schema)
            typeText += t(record?.value?.schema);
        if(passedType.value) 
            typeText+= t(passedType.value)
        if(record?.value?.realms?.length)
            typeText += t('from the secretariat');
    
        return typeText
    });
    const imageGenStore = useImageGenStore();
    const imageSrc = computed(() => siteStore.host + record.value.fieldMediaImage?.uri?.url) //siteStore.host + fieldMediaImage?.value?.uri?.url
    const imageAlt = computed(() => record?.value?.fieldMediaImage?.meta?.alt)
    const goTo     = computed(() => {
                                    if(external.value) return record.value.href;

                                    const localePath = useLocalePath();

                                    return localePath(record.value.href)
                                })

    function dateFormat(date){
        return DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy');
    }

    const img    = useImage();
    const imgUri = record.value? (record?.value?.mediaImage?.src || imageGenStore.getImage(record?.value)?.src) : undefined;
    const hasImg = imgUri && imgUri !== '/images/no-image.png';  

    const backgroundStyles = computed(() => {
        const imgOptions = { 
                                height: 300,
                                width: 500,
                                fit: 'outside',
                                quality: 60,
                                format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif']
                            }


        const imgSrc = img(imgUri, imgOptions)

        return {'background':`url('${imgSrc}') no-repeat center`,  'background-size': 'cover'}
        })


    const style      = reactive({ '--bs-primary': siteStore.primaryColor, })
    const colorStyle = reactive({ color: siteStore.primaryColor, })
    const linkStyle  = reactive({ '--bs-primary': siteStore.primaryColor, color: siteStore.primaryColor, 'text-decoration': `underline ${siteStore.primaryColor}` })
    const bgStyle    = reactive({ 'background-color': siteStore.primaryColor })
</script>
<style lang="scss" scoped>

.arrow{
    fill:var(--bs-blue);
    width       : 1.3em;
    height      : 1.3em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}

</style>
