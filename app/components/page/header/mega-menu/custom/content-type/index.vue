<template>
        <LazyPageHeaderMegaMenuHeader  :menu="menu" /> 

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menu.dataMap" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide" id="page-header-mega-menu-custom-content-type">
                    <section v-if="isTop" v-for="(aChild,j) in drupalMenus" :id="`page-header-mega-menu-custom-content-type-drupal-item-${j}`" :key="`drupal-${j}`">
                        <LazyPageHeaderMegaMenuLink v-if="!isHeader(aChild)" :type="getContentType()" :show-thumbs="menu.class?.includes('bl2-show-thumbs')" :show-cards="isCardView"  :menu="aChild" />
                        <LazyPageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />
                    </section>
                    <div :class="cardContainerClasses" id="page-header-mega-menu-custom-content-type-cards" class="align-self-stretch">
                        <section v-for="(aChild,j) in menu.dataMap[slotProps.country]" :id="`page-header-mega-menu-custom-content-type-item-${j}`" :key="j" :style="cardSectionStyle">

                            <LazyPageHeaderMegaMenuLink v-if="!isHeader(aChild)" :type="getContentType()" :show-thumbs="menu.class?.includes('bl2-show-thumbs')" :show-cards="isCardView"  :menu="aChild" />
                            <LazyPageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />

                        </section>
                    </div>
                    <section v-if="!isTop" v-for="(aChild,j) in drupalMenus" :id="`page-header-mega-menu-custom-content-type-drupal-item-${j}`" :key="`drupal-top-${j}`">
                        <LazyPageHeaderMegaMenuLink v-if="!isHeader(aChild)" :type="getContentType()" :show-thumbs="menu.class?.includes('bl2-show-thumbs')" :show-cards="isCardView"  :menu="aChild" />
                        <LazyPageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />
                    </section>
                    <div v-if="menu.finalLink" id="page-header-mega-menu-custom-content-type-final-link" class="content-type__final-link">
                        <LazyPageHeaderMegaMenuLink
                            :menu="menu.finalLink"
                            :type="getContentType()"
                            :show-thumbs="false"
                            :show-cards="false"
                            :hide-final="menu.finalLink.hide"
                        />
                    </div>
                </section>
            </Transition>
        </LazyPageHeaderMegaMenuCustomCountryTab>
</template>

<script setup>
    import clone from 'lodash.clonedeep';

    const DEFAULT_HORIZONTAL_CARD_LIMIT = 4;
    const DEFAULT_MAX_ROWS_PER_COLUMN = 0;
    // Mirrors getContentTypeMenuLength in server/utils/drupal/drupal-content-types.js.
    const DEFAULT_CONTENT_TYPE_MENU_LENGTH = 6;
    const BCH_NEWS_CONTENT_TYPE = 'news';
    
    const  { t, locale }       = useI18n();
    const   localePath         = useLocalePath();
    const   props              = defineProps({ type: String, menu: Object });
    const { menu: passedMenu } = toRefs(props);
    const   menuStore          = useMenusStore();
    const   siteStore          = useSiteStore();
    const   isFinalLink        = (aMenu)=> unref(aMenu)?.class?.includes('main-nav-final-link') || unref(aMenu)?.class?.includes('mm-main-nav-final-link');
    const   drupalMenus        = computed(()=> unref(passedMenu)?.children?.filter(aMenu => !isFinalLink(aMenu)) || []);
    const   contentTypeTid     = computed(()=> {
        const contentTypeName = getContentType();
        const contentType = menuStore.getContentType(contentTypeName, unref(locale));
        return contentType?.drupalInternalId;
    });
    const   isTop              = computed(()=> {
        const tid = unref(contentTypeTid);
        if(!tid) return true;
        const position = siteStore.biolandSettings?.megaMenu?.contentTypeMenus?.[tid]?.menuPosition;
        return !position || position === 'top';
    });
    const   hasFinalLink       = computed(()=> unref(passedMenu)?.children?.find(aMenu => isFinalLink(aMenu)));
    const   finalLink          = computed(()=> {
    const   existing           = unref(hasFinalLink);

        if(existing)
            return clone(existing);

        return getDefaultFinalLink();
    });
    const   viewport           = useViewport();
    const   mergesBchNews      = !!siteStore?.isBiosafetySite && getContentType() === BCH_NEWS_CONTENT_TYPE;
    // This component mounts only when its drop-down opens, so the fetch is already lazy; the shared cached
    // key reuses the home widget's payload and skips refetching on re-open.
    const   bchNews            = mergesBchNews ? useLatestBchNews({ lazy: true, server: false }).data : ref([]);
    const   contentTypeMenuLength = computed(()=> {
        const configured = Number(siteStore?.biolandSettings?.megaMenu?.contentTypeMenus?.[unref(contentTypeTid)]?.maxMenus);

        return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_CONTENT_TYPE_MENU_LENGTH;
    });



    function getDefaultFinalLink(){
        const   contentTypeName         = getContentType();
        const   contentType             = menuStore.getContentType(contentTypeName,unref(locale));

        if(!contentType) return null;

        const { count, slug } = contentType;
        const hide = count === contentType?.data?.length;

        return {
            title: t(`View more`),
            href:  `${slug}`,
            class: ['main-nav-final-link'],
            target: ['_self'],
            count, hide
        }
    }

    const isCardView = computed(()=> {
        const isXl         = ['xl', 'xxl'].includes(viewport.breakpoint.value);
        const isShowThumbs = unref(passedMenu).class.includes('bl2-show-thumbs')
        const isCardGeneral = unref(passedMenu).class.includes('bl2-2x') || unref(passedMenu).class.includes('bl2-3x') || unref(passedMenu).class.includes('bl2-4x') || unref(passedMenu).class.includes('bl2-5x');
        const isXlCard       = unref(passedMenu).class.includes('bl2-2x-xl') || unref(passedMenu).class.includes('bl2-3x-xl') || unref(passedMenu).class.includes('bl2-4x-xl') || unref(passedMenu).class.includes('bl2-5x-xl');    
        if(isCardGeneral  && isShowThumbs) return true;

        if(isXlCard  && isXl && isShowThumbs) return true;

        return false
    });

    const horizontalCardLimit = computed(()=> {
        const value = siteStore?.theme?.megaMenu?.horizontalCardMax;
        const configuredLimit = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;

        if(Number.isInteger(configuredLimit) && configuredLimit > 0)
            return configuredLimit;

        return DEFAULT_HORIZONTAL_CARD_LIMIT;
    });

    const cardContainerClasses = computed(()=> {
        if(!isCardView.value) return null;

        return ['d-flex','justify-content-between','flex-wrap'];
    });

    const cardSectionStyle = computed(()=> {
        if(!isCardView.value) return undefined;

        const width = `${(100 / horizontalCardLimit.value).toFixed(4)}%`;

        return {
            flex: `0 0 ${width}`,
            maxWidth: width,
            padding: '0 .5rem 0 .5rem'
        };
    });

    const menu = computed(()=> {

        const countries = siteStore.countries;
        const aMenu     = clone(unref(passedMenu));
        const children  = aMenu?.children?.filter(aMenu => !isFinalLink(aMenu)) || [];

        aMenu.children  = [ ...children ];
        aMenu.dataMap = {};
        aMenu.finalLink = finalLink.value;

        if(!aMenu.href || aMenu.href === '#'){
            const contentType = menuStore.getContentType(getContentType(), unref(locale));

            if(!contentType) return aMenu; // Content type not loaded yet for this locale

            aMenu.href = contentType.slug;
        }
        for (const country of countries)
            aMenu.dataMap[country] = getContentTypeData(country)

        return aMenu;
    })

    function isHeader(m){
        const menu = unref(m);

        return  Array.isArray(menu?.class) && menu?.class?.includes('main-nav-sub-heading');
    }

    function getContentType(){
   
        const classes = (unref(passedMenu)?.class?.filter(aClass => aClass.startsWith('bl2-content-type-')) || []).map((aClass)=> aClass.replace('bl2-content-type-',''));

        if(!Array.isArray(classes)) return '';

        const name = classes.length >1? classes : classes[0];

        if(!name) throw new Error('No content type found in menu  item');


        return name 
    }

    function getMaxRowsPerColumn(){
        const [max] = (unref(passedMenu)?.class?.filter(aClass => aClass.startsWith('bl2-ct-max-row-per-column-')) || []).map((aClass)=> aClass.replace('bl2-ct-max-row-per-column-',''));

        if(max) return max;

        return siteStore?.theme?.megaMenu?.maxRowsPerColumn ?? DEFAULT_MAX_ROWS_PER_COLUMN;
    }
    function getContentTypeData(country){
        const contentTypeName = getContentType();

        const children    = unref(passedMenu)?.children || [];
       
        const siteData    = menuStore.getContentTypeData(contentTypeName, country, unref(locale)) || [];

        // BCH news is SCBD-wide (latest-bch queries the index without a country filter), so it goes in every tab.
        const data        = mergesBchNews ? mergeBchNewsIntoMegaMenu(siteData, unref(bchNews), unref(contentTypeMenuLength)) : siteData;

        const menuPaths   = unref(passedMenu)?.children?.map(aMenu => aMenu.href) || [];

        const returnData        = [...data.filter(aMenu => !menuPaths.includes(aMenu.href))]

        if(!isCardView.value && getMaxRowsPerColumn())
            return returnData.slice(0,getMaxRowsPerColumn());

        return returnData;
    }

</script>
