<template>
    <p  v-if="!showThumbs &&  !isFinalLink &&  !showCards " class="text-wrap">
        <NuxtLink  class="child-link" :class="menu.class"   :to="localePath (menu.href)" :title="title || menu.title" :external="isExternal" :target="target">
            {{title || menu.title}}  {{menu.class}} {{isFinalLink}}<span v-if="menu.count" class="text-nowrap text-muted">&#65279;&nbsp;({{menu.count}})</span><span class="text-nowrap">&#65279;&nbsp;<LazyIcon v-if="isExternal && !isSpecial " name="external-link"  class="ex-link" /></span>
        </NuxtLink>
    </p>
    <div v-if="isFinalLink && menu.count && !hideFinal "  :class="menu.class">
        <NuxtLink  class="child-link"   :to="localePath (menu.href)" :title="title || menu.title" :external="isExternal" :target="target">
            {{title || menu.title}} <span v-if="menu.count" class="text-nowrap text-muted">&#65279;&nbsp;({{menu.count}})</span><span class="text-nowrap">&#65279;&nbsp;<LazyIcon v-if="isExternal && !isSpecial " name="external-link"  class="ex-link" /></span>
        </NuxtLink>
    </div>
    <section v-if="!showCards">
        <NuxtLink  v-if="showThumbs && !isFinalLink " class="child-link" :class="menu.class"   :to="localePath(menu.href)" :title="menu.title" :external="isExternal" :target="target">
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

    <section v-if="showCards && !isFinalLink">
        <NuxtLink  class="child-link" :class="menu.class"   :to="localePath(menu.href)" :title="menu.title" :external="isExternal" :target="target">
            <div class="card" style="max-width: 160px;">
                <NuxtImg :src="menu.thumb" class="img-fluid" :alt="menu.title" width="160" height="100"/>
                <div class="card-body">
                    <p class="card-text" :class="{ 'card-text--long-word': hasLongWord }">{{menu.title}}</p>
                    <p class="card-text"><small class="text-muted">{{dateFormat(menu)}}</small></p>
                </div>
            </div>
        </NuxtLink>
    </section>
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
                                        hideFinal : { type: Boolean, default: false }
                                    });
    const propRefs = toRefs(props);
    const menu = propRefs.menu;
    const showThumbs = propRefs.showThumbs;
    const type = propRefs.type;
    const localize = propRefs.localize;
    const providedTitle = propRefs.title;
    const hideFinal = propRefs.hideFinal;

    const   localizePath = useLocalePath();
    const   localePath   = (to)=> localize.value? localizePath(to): to;
    const   isFinalLink  = computed(()=> menu?.value?.class?.includes('main-nav-final-link') || menu?.value?.class?.includes('mm-main-nav-final-link'));
    const   isSpecial    = computed(()=> menu?.value?.class?.includes('special'));
    const   isExternal   = computed(()=> menu?.value?.href?.includes('http'));
    const   target       = computed(()=> menu?.value?.target? menu?.value?.target[0] : isExternal.value? '_blank':'_self');
    const   displayTitle = computed(()=> providedTitle?.value || menu?.value?.title || '');
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