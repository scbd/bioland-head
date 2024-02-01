<template>
   
    <div class="text-capitalize mb">
        <h4 class="bm-3">{{name}} </h4>
    </div>
    <!-- <LazyCards :record="record" /> -->
    <div class="card " >
        <h6 class="card-subtitle text-muted mb-1">{{type}}</h6>

        <div  v-if="hasImg" :style="backgroundStyles" class=" bg-light">
            <NuxtLink :to="goTo"   :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
        </div>

        <div class="card-body">
            
            <h5 class="card-title  mb-3">
                <NuxtLink class="text-primary fw-bold" :to="goTo"   :external="external" :target="external? '_blank': ''">{{record.title}}</NuxtLink>
            </h5>
            <p class="card-text">{{trunc(record.summary)}}</p>

        </div>
        <div class="card-footer">
            <span v-if="record?.city" class="badge bg-primary me-1"> {{record.city}}</span>
            <span v-if="record?.country" class="badge bg-secondary me-1"> {{record.country}}</span>


            
            <NuxtLink  v-for="(aTarget,i) in record?.tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <GbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>

            <NuxtLink  v-for="(aSdg,i) in record?.tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>

            <span  v-if="tags?.subjects?.length" v-for="(subject,i) in tags.subjects" :key="i" class="badge bg-primary me-1">{{subject.name}}</span>

            <span v-if="record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate" class="float-end card-subtitle text-nowrap text-muted text-small mt-1 mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate)}}</span>

        </div>
    </div>
    <div class="mb-5">
        <div v-for="(link,i) in links || []" :key="i" class="text-start my-3 mb-3">
            <NuxtLink :to="link.to" class="text-decoration-underline  text-primary  fw-bold fs-5" :external="external">
                    {{link.name}}
            </NuxtLink>
            &nbsp;
            <Icon  v-if="!external" name="arrow-right" class="arrow" />
            <Icon  v-if="external" name="external-link" class="arrow" />
        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/widget/index.json"></i18n>
<script setup>
    import { getGbfUrl    } from '~/util'        ;
    import { useSiteStore } from '~/stores/site' ;
    import { DateTime     } from 'luxon'         ;

    const { trunc  } = useText();
    const siteStore = useSiteStore();
    const   props       = defineProps({t: { type: String } , name: { type: String } , record: { type: Object }, links: { type: Array } });
    const { name, record, links, t:passedType    } = toRefs(props);

    const { t, locale } = useI18n();

    const tags = computed(()=> record?.value?.tags);

    const external = computed(()=> {
        if(record?.value.href.startsWith('https://')) return true;
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
            typeText += t(' from the secretariat');
    
        return typeText
    });

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

    const img = useImage();
    const imgUri = record?.value?.mediaImage?.src || '/images/no-image.png';
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


</script>
<i18n src="@/i18n/dist/components/widget/index.json"></i18n>
<style lang="scss" scoped>

.arrow{
    fill:var(--bs-blue);
    width       : 1.3em;
    height      : 1.3em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}

</style>
