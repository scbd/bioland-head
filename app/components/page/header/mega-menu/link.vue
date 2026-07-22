<template>
    <div class="mega-menu-link-wrapper" :style="{ paddingLeft: depth > 0 ? '1rem' : '0' }">
        <p v-if="!showThumbs &&  !isFinalLink &&  !showCards " id="page-header-mega-menu-link-text" class="text-wrap">
            <NuxtLink  class="child-link" :class="menu.class"   :to="safeLocalePath(menu.href)" :title="title || menu.title" :external="isExternal" :target="target">
                {{title || menu.title}}  {{menu.class}} {{isFinalLink}}<span v-if="menu.count" class="text-nowrap text-muted">&#65279;&nbsp;({{menu.count}})</span><span class="text-nowrap">&#65279;&nbsp;<LazyIcon v-if="isExternal && !isSpecial " name="external-link"  class="ex-link" /></span>
            </NuxtLink>
        </p>
        <div v-if="isFinalLink && menu.count && !hideFinal" id="page-header-mega-menu-link-final" :class="menu.class">
            <NuxtLink  class="child-link"   :to="safeLocalePath(menu.href)" :title="title || menu.title" :external="isExternal" :target="target">
                {{title || menu.title}} <span v-if="menu.count" class="text-nowrap text-muted">&#65279;&nbsp;({{menu.count}})</span><span class="text-nowrap">&#65279;&nbsp;<LazyIcon v-if="isExternal && !isSpecial " name="external-link"  class="ex-link" /></span>
            </NuxtLink>
        </div>
        <section v-if="!showCards" id="page-header-mega-menu-link-thumb-section">
            <NuxtLink  v-if="showThumbs && !isFinalLink " id="page-header-mega-menu-link-thumb" class="child-link" :class="menu.class"   :to="safeLocalePath(menu.href)" :title="menu.title" :external="isExternal" :target="target">
                <div class="d-flex mb-2">
                    <div class="col-3 align-self-center">
                        <NuxtImg :src="menu.thumb || '/images/no-image.png'" class="img-fluid" :alt="title || menu.title" width="64" height="64"/>
                    </div>
                    <div class="col-9 align-self-center">
                        <p class="text-wrap card-text ps-1">
                            {{title || menu.title}}<span v-if="menu.count" class="text-nowrap text-muted">&#65279;&nbsp;({{menu.count}})</span><span class="text-nowrap">&#65279;&nbsp;<LazyIcon v-if="isExternal && !isSpecial " name="external-link"  class="ex-link" /></span>
                        </p>
                    </div>
                </div>
            </NuxtLink>
        </section>

        <section v-if="showCards && !isFinalLink" id="page-header-mega-menu-link-card-section">
            <NuxtLink id="page-header-mega-menu-link-card" class="child-link" :class="menu.class"   :to="safeLocalePath(menu.href)" :title="menu.title" :external="isExternal" :target="target">
                <div class="card" style="max-width: 160px;">
                    <NuxtImg :src="menu.thumb" class="img-fluid card-img" :alt="menu.title" width="102" height="64" fit="cover" format="webp"/>
                    <div class="card-body">
                        <p class="card-text" :class="{ 'card-text--long-word': hasLongWord }">{{menu.title}}</p>
                        <p class="card-text"><small class="text-muted">{{dateFormat(menu)}}</small></p>
                    </div>
                </div>
            </NuxtLink>
        </section>

        <!-- Recursive children rendering -->
        <div v-if="hasChildren" class="mega-menu-link-children">
            <PageHeaderMegaMenuLink
                v-for="(child, index) in menu.children"
                :key="child.href || index"
                :menu="child"
                :show-thumbs="showThumbs"
                :show-cards="showCards"
                :type="type"
                :localize="localize"
                :hide-final="hideFinal"
                :depth="depth + 1"
            />
        </div>
    </div>
</template>

<script setup>
    import { DateTime } from 'luxon';

    const { locale  }   = useI18n();
    const   props       = defineProps({ 
                                        menu      : Object,
                                        showThumbs: Boolean,
                                        showCards : Boolean,
                                        title     : String,
                                        type      : String,
                                        localize  : { type: Boolean, default: true },
                                        hideFinal : { type: Boolean, default: false },
                                        depth     : { type: Number, default: 0 }
                                    });
    const propRefs = toRefs(props);
    const menu = propRefs.menu;
    const showThumbs = propRefs.showThumbs;
    const type = propRefs.type;
    const localize = propRefs.localize;
    const providedTitle = propRefs.title;
    const hideFinal = propRefs.hideFinal;
    const depth = propRefs.depth;

    const { safeLocalePath } = useSafeLocalePath(localize);

    const   isFinalLink  = computed(()=> menu?.value?.class?.includes('main-nav-final-link') || menu?.value?.class?.includes('mm-main-nav-final-link'));
    const   isSpecial    = computed(()=> menu?.value?.class?.includes('special'));
    const   isExternal   = computed(()=> menu?.value?.href?.includes('http'));
    const   target       = computed(()=> menu?.value?.target? menu?.value?.target[0] : isExternal.value? '_blank':'_self');
    const   displayTitle = computed(()=> providedTitle?.value || menu?.value?.title || '');
    const   hasChildren  = computed(()=> menu?.value?.children?.length > 0);
    const   hasLongWord  = computed(()=> {
        const value = displayTitle.value.trim();

        if(!value)
            return false;

        return value
            .split(/\s+/)
            .some((word)=> word.replace(/[\s\\/.,;:!?()\[\]{}"'`~@#$%^&*_+=|-]/g, '').length >= 12);
    });

    if(type.value)
        menu.value.schema= type;

    const imageGenStore = useImageGenStore();

    if(!menu?.value?.thumb || menu?.value?.thumb === '/images/no-image.png')
        menu.value.thumb= imageGenStore.getImage(menu.value).src;


    function dateFormat({ startDate, created, changed }){
        const date = startDate || created || changed;

        return date? DateTime.fromISO(date).setLocale(locale.value).toFormat('dd LLL yyyy') : '';
    }
</script>

<style lang="scss" scoped>
.mega-menu-link-wrapper {
    position: relative;
}

.mega-menu-link-children {
    display: flex;
    flex-direction: column;
}

.mm-main-nav-final-link,
.main-nav-final-link{
    position: absolute;
    bottom: -30px;

}
.child-link{
    color: var(--bs-heading-color);
    text-decoration-color: var(--bs-heading-color);
    word-break: keep-all;
    overflow-wrap: break-word;
    hyphens: manual;
}

.child-link .card-text{
    word-break: keep-all;
    overflow-wrap: normal;
    hyphens: manual;
}

// Force a uniform thumbnail box regardless of whether IPX cover-cropped the
// source. `.img-fluid` alone leaves height:auto, so an un-processed source
// (non-allow-listed domain, SVG, cache miss) renders at its native ratio and
// the cards end up mismatched. object-fit crops client-side as a guarantee.
.card .card-img{
    width: 100%;
    aspect-ratio: 102 / 64;
    height: auto;
    object-fit: cover;
}

.child-link .text-wrap,
.child-link .text-nowrap{
    word-break: inherit;
    overflow-wrap: inherit;
    hyphens: inherit;
}
.mm-main-nav-final-link,

.mm-special,
.special{
    color: #009edb !important;
    background-color: transparent !important;
    border: none !important;
    padding: 0 !important;
    font-weight: 500 !important;
    font-size: 1.1rem !important;
    line-height: 1.5rem !important;
}
.mm-special::after,
.special::after {
    content: " →";
}
.ex-link{
    fill:var(--bs-blue);
    transition: 0.3s;
}
@media (min-width: 992px) {
    .child-link .card-text.card-text--long-word{
        word-break: break-word;
        overflow-wrap: anywhere;
        hyphens: auto;
    }
}
@media (max-width: 991.98px) { 
    // .mm-main-nav-final-link,
    // .main-nav-final-link{
    //     position: relative;
    //     bottom: unset;
    // }
}
</style>