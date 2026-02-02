<template>
    <div :style="style" class="card p-2 text-center">
        <div class="hero-image-wrapper d-flex justify-content-center text-center">
            <div v-if="imageSrc" class="hero-image-container" :style="heroBackgroundStyles">
                <NuxtImg v-bind="imageDefaults" :alt="imageAlt" :src="imageSrc" class="card-img-top i-top"/>
                <div class="hero-description-overlay">
                    <p class="hero-description text-white mb-0" v-html="heroDescription"></p>
                </div>
            </div>
            <LazyIcon v-else name="image" :size="8" />
        </div>
        <div class="card-body">
            <h6 class="card-subtitle text-muted mb-2">{{ t('Hero Image') }}</h6>
            <h5 class="card-title mb-1">{{ imageAlt }}</h5>

        </div>
        <div class="card-footer">
            <h6 class="card-subtitle text-muted text-small">{{ dateFormat(record.fieldPublished || record.created) }}</h6>

            <hr class="mb-2 mt-1"/>

            <NuxtLink v-for="(aTarget, i) in tags?.gbfTargets || []" :key="i" :to="getGbfUrl(aTarget.identifier)" target="_blank" external>
                <LazyGbfIcon :identifier="aTarget.identifier" size="xs"/>
            </NuxtLink>

            <NuxtLink v-for="(aSdg, i) in tags?.sdgs || []" :key="i" :to="aSdg.url" target="_blank" external>
                <NuxtImg :alt="aSdg.name" :src="aSdg.image" width="25" height="25" class="me-1"/>
            </NuxtLink>

            <section v-if="tags?.subjects" class="mt-1">
                <span v-for="(subject, i) in tags.subjects" :key="i" class="badge bg-primary me-1">{{ t(subject.identifier) }}</span>
            </section>

            <hr class="my-2" v-if="tags?.subjects || tags?.sdgs || tags?.gbfTargets"/>
            <h6 class="card-subtitle text-primary">
                <NuxtLink :style="arrowFill" :to="linkTo" :title="imageAlt">
                    {{ t('View more') }} <LazyIcon name="arrow-right" class="arrow" />
                </NuxtLink>
            </h6>
        </div>
    </div>
</template>

<script setup>

    const   props       = defineProps({ record: { type: Object } });
    const { record    } = toRefs(props);
    const { t, locale } = useI18n();

    const   siteStore          = useSiteStore();
    const   dateFormat         = useDateFormat(locale);
    const { style, arrowFill } = useTheme();
    const   imageDefaults      = useMediaCardImageDefaults();

    const { getGbfUrl, descriptionTruncated, imageAlt, tags, imageSrc, linkTo } = useMediaRecord(record);

    // Hero media stores description in fieldDescription.value, not description
    const heroDescription = computed(() => record.value?.fieldDescription?.value || record.value?.description || '');

    const hexToRgb = hex => hex?.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (m, r, g, b) => '#' + r + r + g + g + b + b)
                            ?.substring(1)?.match(/.{2}/g)
                            ?.map(x => parseInt(x, 16))?.join(', ');

    const heroBackgroundStyles = computed(() => {
        const primary0 = siteStore?.theme?.hero?.primary?.[0] || '#000000';
        const primary1 = siteStore?.theme?.hero?.primary?.[1] || '#000000';
        
        return {
            background: `linear-gradient(rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.2) 100%), linear-gradient(90deg, rgba(${hexToRgb(primary0)}, 0.9) 0%, rgba(${hexToRgb(primary0)}, 0) 100%), linear-gradient(0deg, rgba(${hexToRgb(primary1)}, 0.9) 0%, rgba(${hexToRgb(primary0)}, 0.9) 100%)`
        };
    });
</script>
<style lang="scss" scoped>
.hero-image-wrapper {
    width: 100%;
}
.hero-image-container {
    position: relative;
    width: 100%;
    border-radius: 4px;
    overflow: hidden;
    background-size: cover;
    background-blend-mode: normal, normal, color;
}
.hero-description-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    z-index: 10;
}
.hero-description {
    font-size: 0.85rem;
    line-height: 1.4;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: #ffffff !important;
}
.hero-image-container .i-top {
    mix-blend-mode: overlay;
    opacity: 0.85;
    position: relative;
    z-index: 1;
}
.i-top {
    max-height: 250px;
    width: 100%;
    object-fit: cover;
}
.card {
    width: 350px;
    height: 450px !important;
    border: .5px solid var(--bs-primary);
}
.arrow {
    fill: var(--bs-blue);
    width: 1em;
    height: 1em;
    cursor: pointer;
    margin-bottom: 0.2rem;
}
@media (max-width: 991px) {
    .card {
        width: 90%;
    }
}
</style>
