<template>
    <div class="card " >
        <ClientOnly>
        <div :style="backgroundStyles" class="cit bg-light">
            <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
        </div>
        </ClientOnly>
        <div class="card-body">
            <h6 class="card-subtitle text-muted mb-2">{{type}} {{record.schema? `- ${record.schema}`: ''}}</h6>
            <h5 class="card-title  mb-3">
                <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''">{{record.title}}</NuxtLink>
            </h5>
            <p class="card-text">{{trunc(record.summary)}}</p>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate)}}</h6>

            <span v-if="record?.eventCity" class="badge me-1" :style="badgePrimaryStyle"> {{record.eventCity}}</span>
            <span v-if="record?.eventCountry" class="badge" :style="badgeSecondaryStyle"> {{record.eventCountry}}</span>
            <NuxtLink  v-for="(aTarget,i) in record?.tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <GbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>

            <NuxtLink  v-for="(aSdg,i) in record?.tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>
        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/cards/index.json"></i18n>
<script setup>
    import { getGbfUrl    } from '~/util'        ;
    import { useSiteStore } from '~/stores/site' ;
    import { DateTime     } from 'luxon'         ;

    const { trunc  } = useText();
    const siteStore = useSiteStore();
    const imageGenStore = useImageGenStore();

    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);

    const { t, locale } = useI18n();

    const tags = computed(()=> record?.value?.tags);

    const external = computed(()=> !!record?.value?.realms);
    const type = computed(()=> { 
        if(record?.value?.fieldTypePlacement?.name) 
            return  record?.value?.fieldTypePlacement?.name;

        if(record?.value?.realms?.length)
            return t('from the secretariat');
    });

    const imageSrc = computed(()=> siteStore.host + record.value.fieldMediaImage?.uri?.url) //siteStore.host + fieldMediaImage?.value?.uri?.url
    const imageAlt = computed(()=> record?.value?.fieldMediaImage?.meta?.alt)
    const goTo = computed(()=> {
        if(external.value) return record.value.href;

        const localePath = useLocalePath();

        return localePath(record.value.href)
    })

    function dateFormat(date){
        return DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy');
    }

    const img    = useImage();
    const imgUri = record?.value?.mediaImage?.src || imageGenStore.getImage(record?.value)?.src;'/images/no-image.png'
    
    const backgroundStyles = computed(() => {
        const imgOptions = { 
                                height : 100,
                                width  : 250,
                                fit    : 'outside',
                                quality: 60,
                                format : ['webp', 'avif', 'jpeg', 'jpg', 'png','gif']
                            }
        
        const imgSrc = img(imgUri, imgOptions);

        return {'background':`url('${imgSrc}') no-repeat center fixed`,  'object-fit': 'contain' , 'background-size': '100% auto', 'background-size': '150%'}
    })


      const badgePrimaryStyle = reactive({
        'background-color': siteStore.primaryColor
      })

      const badgeSecondaryStyle = reactive({
        'background-color': siteStore.secondaryColor
      })
</script>
<i18n src="@/i18n/dist/components/cards/index.json"></i18n>
<style lang="scss" scoped>
.i-top{
    max-height: 250px;
    object-fit: cover;
}
.cit{
    height: 232px !important;
}
.card {
    width: 350px;
    height: 600px !important;
    // border: .5px solid var(--bs-blue);
}
.arrow{
    fill:var(--bs-blue);
    width       : 1em;
    height      : 1em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}
@media (max-width: 991px) {
    .card {
        width: 90%;
    }
}
</style>
