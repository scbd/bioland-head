<template>
    <div class="card " >
        <div :style="backgroundStyles" class="cit bg-light">
            <NuxtLink :to="linkTo" style="color:black;"><div style="width:100%;height:100%;"></div></NuxtLink> 
        </div>

        <div class="card-body">
            <h6 class="card-subtitle text-muted mb-2">{{type}}</h6>
            <h5 class="card-title  mb-3">
                <NuxtLink :to="linkTo" style="color:black;">{{record.title}}</NuxtLink> 
            </h5>

            <p class="card-text">{{record.summary}}</p>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small mb-2">{{dateFormat(record.fieldPublished || record.fieldStartDate ||record.changed)}}</h6>

            <NuxtLink  v-for="(aTarget,i) in record?.tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <GbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>

            <NuxtLink  v-for="(aSdg,i) in record?.tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>
        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/cards/media/index.json"></i18n>
<script setup>
    import { getGbfUrl    } from '~/util'        ;
    import { useSiteStore } from '~/stores/site' ;
    import { DateTime     } from 'luxon'         ;

    const siteStore = useSiteStore();
    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);

    const { t, locale } = useI18n();

    const tags = computed(()=> record?.value?.tags);

const type = computed(()=> record?.value?.fieldTypePlacement?.length? record?.value?.fieldTypePlacement[0]?.name : null);
    const imageSrc = computed(()=> siteStore.host + record.value.fieldMediaImage?.uri?.url) //siteStore.host + fieldMediaImage?.value?.uri?.url
    const imageAlt = computed(()=> record?.value?.fieldMediaImage?.meta?.alt)
    const linkTo  = computed(()=> record?.value?.path?.alias)

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

        return {'background':`url('${imgSrc}') no-repeat center fixed`,  'object-fit': 'contain' , 'background-size': '100% auto', 'background-size': '150%'}
        })

        consola.info(record.value)
</script>
<i18n src="@/i18n/dist/components/cards/index.json"></i18n>
<style lang="scss" scoped>
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
</style>
