<template>
    <div  :style="style" class="card p-2 text-center" >
        <div class="d-flex justify-content-center text-center">
            <NuxtImg v-if="imageSrc" quality="35" :alt="record.name" :src="imageSrc" format="webp" :width="imgWidth" :height="imgHeight" class="card-img-top i-top"/>
            <LazyIcon v-if="!imageSrc" :name="'video'" :color="siteStore.primaryColor" :size="8" class="card-img-top i-top"/>
        </div>
        <div class="card-body">
            <h6 class="card-subtitle text-muted mb-2">{{t('Video')}}</h6>
            <h5 class="card-title  mb-1">{{record.name}}</h5>

            <p class="card-text">{{descriptionTruncated}}</p>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small">{{dateFormat(record.fieldPublished || record.created)}}</h6>

            <hr class="mb-2 mt-1"/>

            <NuxtLink  v-for="(aTarget,i) in tags?.gbfTargets || []" :key="i"  :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <LazyGbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>
            <NuxtLink  v-for="(aSdg,i) in tags?.sdgs || []" :key="i"  :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>

            <section v-if="tags?.subjects">
                <span  v-for="(subject,i) in tags.subjects" :key="i" class="badge bg-primary me-1">{{subject.name}}</span>
            </section>

            <hr class="my-2" v-if="tags?.subjects || tags?.sdgs || tags?.gbfTargets"/>
            <h6 class="card-subtitle text-primary">
                <NuxtLink  :style="arrowFill" :to="linkTo" :title="record.name" >
                    {{t('View more')}} <LazyIcon  name="arrow-right"  />
                </NuxtLink>
            </h6>
        </div>
    </div>
</template>
<script setup>
    const   siteStore      = useSiteStore();
    const   props          = defineProps({ record: { type: Object } });
    const { record    }    = toRefs(props);
    const { t, locale }    = useI18n();

    const   dateFormat  = useDateFormat(locale);
    const { arrowFill, style } = useTheme();

    const { getGbfUrl, descriptionTruncated, tags, imageSrc, linkTo, imgHeight, imgWidth, iconName, iconColor} = useMediaRecord(record);
</script>
<style lang="scss" scoped>
.i-top{
    max-height: 250px;

}
.card {
    width: 350px;
    height: 450px !important;
    border: .5px solid var(--bs-primary);
}
.arrow{
    fill:var(--bs-primary);
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
