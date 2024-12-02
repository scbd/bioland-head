<template>
    <div :style="style" class="card p-2 text-center" >
        <div class="d-flex justify-content-center text-center">
            <NuxtImg  v-if="imageSrc" quality="35" :alt="imageAlt" :src="imageSrc" :width="imgWidth" :height="imgHeight"  format="webp" class="card-img-top image-top i-top"/>
            <Icon v-if="!imageSrc" :name="'file-image-o'"  :size="8" />
        </div>
        <div class="card-body">
            <h6 class="card-subtitle text-muted mb-2">{{t('Image')}}</h6>
            <h5 class="card-title  mb-1">{{imageAlt}}</h5>

            <p class="card-text">{{descriptionTruncated}}</p>

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
                <span  v-for="(subject,i) in tags.subjects" :key="i" class="badge bg-primary me-1">{{t(subject.identifier)}}</span>
            </section>

            <hr class="my-2" v-if="tags?.subjects || tags?.sdgs || tags?.gbfTargets"/>
            <h6 class="card-subtitle text-primary">
                <NuxtLink  :style="arrowFill" :to="linkTo" :title="imageAlt" >
                    {{t('View more')}} <Icon  name="arrow-right" class="arrow" />
                </NuxtLink>
            </h6>
        </div>
    </div>
</template>

<script setup>

    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);
    const { t, locale } = useI18n();

    const {  getGbfUrl }   = useDocumentHelpers(record);
    const dateFormat       = useDateFormat(locale);
    const { style, arrowFill      } = useTheme();

    const { descriptionTruncated, imageAlt, tags, imageSrc, linkTo,  imgHeight, imgWidth, iconName, iconColor} = useMediaRecord(record);
</script>
<style lang="scss" scoped>
.i-top{
    max-height: 250px;
    // object-fit: cover;
}
.card {
    width: 350px;
    height: 450px !important;
    border: .5px solid var(--bs-primary);
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
