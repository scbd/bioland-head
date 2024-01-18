<template>
   
    <div class="text-capitalize mt-4">
        <h3>{{t(name)}}</h3>


    </div>
    <!-- <LazyCards :record="record" /> -->
    <div class="card " >
        <h6 class="card-subtitle text-muted mb-2">{{type}}</h6>
        <div :style="backgroundStyles" class=" bg-light">
            <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''"><div style="width:100%;height:200px;"></div></NuxtLink> 
        </div>

        <div class="card-body">
            
            <h5 class="card-title  mb-3">
                <NuxtLink :to="goTo" style="color:black;"  :external="external" :target="external? '_blank': ''">{{record.title}}</NuxtLink>
            </h5>
            <p class="card-text">{{trunc(record.summary)}}</p>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate ||record.changed||record.startDate|| record.updatedDate)}}</h6>

            <span v-if="record?.eventCity" class="badge bg-primary me-1"> {{record.eventCity}}</span>
            <span v-if="record?.eventCountry" class="badge bg-secondary"> {{record.eventCountry}}</span>
            <NuxtLink  v-for="(aTarget,i) in record?.tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <GbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>

            <NuxtLink  v-for="(aSdg,i) in record?.tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>
        </div>
    </div>
    <div v-for="(link,i) in links || []" :key="i" class="text-start my-3">
        <NuxtLink :to="link.to" class="text-decoration-underline text-primary  text-bold fs-5">
                {{t(link.name)}} <Icon  name="arrow-right" class="arrow" />
        </NuxtLink>
    </div>
</template>
<i18n src="@/i18n/dist/components/cards/index.json"></i18n>
<script setup>
    import { getGbfUrl    } from '~/util'        ;
    import { useSiteStore } from '~/stores/site' ;
    import { DateTime     } from 'luxon'         ;

    const { trunc  } = useText();
    const siteStore = useSiteStore();
    const   props       = defineProps({ name: { type: String } , record: { type: Object }, links: { type: Array } });
    const { name, record, links    } = toRefs(props);

    const { t, locale } = useI18n();

    const tags = computed(()=> record?.value?.tags);

    const external = computed(()=> !!record?.value?.realms);
    const type = computed(()=> { 
        if(record?.value?.fieldTypePlacement?.name) 
            return  record?.value?.fieldTypePlacement?.name;

        if(record?.value?.realms?.length)
            return t('from the secretariat');
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

    const backgroundStyles = computed(() => {
        const imgOptions = { 
                                height: 300,
                                width: 500,
                                fit: 'outside',
                                quality: 60,
                                format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif']
                            }
        const imgUri = record?.value?.mediaImage?.src || '/images/no-image.png'                   
        const imgSrc = img(imgUri, imgOptions)

        return {'background':`url('${imgSrc}') no-repeat center`,  'background-size': 'cover'}
        })


</script>
<i18n src="@/i18n/dist/components/widgets/index.json"></i18n>
<!-- <style lang="scss" scoped>
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
    width       : 1.5em;
    height      : 1.5em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}
@media (max-width: 991px) {
    .card {
        width: 90%;
    }
}
</style> -->
