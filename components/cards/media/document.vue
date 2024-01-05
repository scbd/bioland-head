<template>
    <div class="card p-2" >
        <NuxtImg :alt="record.name" :src="imageSrc" class="card-img-top i-top"/>
        <div class="card-body">
            <h6 class="card-subtitle text-muted mb-2">{{t('Document')}}</h6>
            <h5 class="card-title  mb-1">{{record.name}}</h5>

            <p class="card-text">{{trunc(record.description)}}</p>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small">{{dateFormat(record.fieldPublished || record.created)}}</h6>

            <hr class="mb-2 mt-1"/>

            <NuxtLink  v-for="(aTarget,i) in tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <GbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>


            <NuxtLink  v-for="(aSdg,i) in tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>


            <section v-if="tags?.subjects" class="mt-1">
                <span  v-for="(subject,i) in tags.subjects" :key="i" class="badge bg-primary me-1">{{subject.name}}</span>
            </section>

            <hr class="my-2" v-if="tags?.subjects || tags?.sdgs || tags?.gbfTargets"/>
            <h6 class="card-subtitle text-primary">
                <NuxtLink   :to="linkTo" :title="record.name" >
                    {{t('View more')}} <Icon  name="arrow-right" class="arrow" />
                </NuxtLink>
            </h6>
        </div>
    </div>
</template>
<i18n src="@/i18n/dist/components/cards/media/index.json"></i18n>
<script setup>
    import { getGbfUrl    } from '~/util'        ;
    import { useSiteStore } from '~/stores/site' ;
    import { DateTime     } from 'luxon'         ;

    const { trunc, isTruncated: isTrunc } = useText();
    const siteStore = useSiteStore();
    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);

    const { t, locale } = useI18n();

    const tags = computed(()=> record?.value?.tags);


    const imageSrc = computed(()=> siteStore.host + record.value.fieldMediaImage?.uri?.url) //siteStore.host + fieldMediaImage?.value?.uri?.url
    const imageAlt = computed(()=> record?.value?.fieldMediaImage?.meta?.alt)
    const linkTo  = computed(()=> record?.value?.path.alias)

    function dateFormat(date){
        return DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy');
    }
</script>
<style lang="scss" scoped>
.i-top{
    max-height: 250px;
    object-fit: cover;
}
.card {
    width: 350px;
    height: 650px !important;
    border: .5px solid var(--bs-blue);
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
