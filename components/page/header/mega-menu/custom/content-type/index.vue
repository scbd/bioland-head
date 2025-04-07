<template>
        <LazyPageHeaderMegaMenuHeader  :menu="menu" />

        <LazyPageHeaderMegaMenuCustomCountryTab v-slot="slotProps" :menu="menu.dataMap" >
            <Transition :name="slotProps.fadeName">
                <section v-if="slotProps.hide">
                    <div :class="{ 'd-flex justify-content-between':isCardView}">
                        <section v-for="(aChild,j) in menu.dataMap[slotProps.country]" :key="j">

                            <LazyPageHeaderMegaMenuLink v-if="!isHeader(aChild)" :type="getContentType()" :show-thumbs="menu.class?.includes('bl2-show-thumbs')" :show-cards="isCardView"  :menu="aChild" />
                            <LazyPageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />

                            <LazyPageHeaderMegaMenuLink v-if="isFinalLink(aChild)"  :menu="aChild" />
                      
                        </section>
                    </div>
                </section>
            </Transition>
        </LazyPageHeaderMegaMenuCustomCountryTab>
</template>

<script setup>
    import   clone           from 'lodash.clonedeep';
    
    const  { t, locale }       = useI18n();
    const   localePath         = useLocalePath();
    const   props              = defineProps({ type: String, menu: Object });
    const { menu: passedMenu } = toRefs(props);
    const   menuStore          = useMenusStore();
    const   isFinalLink        = (aMenu)=> unref(aMenu)?.class?.includes('main-nav-final-link') || unref(aMenu)?.class?.includes('mm-main-nav-final-link');
    const   hasFinalLink       = computed(()=> unref(passedMenu)?.children?.find(aMenu => isFinalLink(aMenu)));
    const   viewport           = useViewport();
    const   siteStore          = useSiteStore();


    function getDefaultFinalLink(){
        const   contentTypeName         = getContentType();
        const { count, slug } = menuStore.getContentType(contentTypeName,unref(locale))

        return {
            title: t(`View more`),
            href:  `${slug}`,
            class: ['main-nav-final-link'],
            target: ['_self'],
            count
        }
    }

    const isCardView = computed(()=> {
        const isXl         = ['xl', 'xxl'].includes(viewport.breakpoint.value);
        const isShowThumbs = unref(passedMenu).class.includes('bl2-show-thumbs')
        
        if(unref(passedMenu).class.includes('bl2-2x') && isShowThumbs) return true;

        if(unref(passedMenu).class.includes('bl2-2x-xl') && isXl && isShowThumbs) return true;

        return false
    });

    const menu = computed(()=> {

        const countries = siteStore.countries;
        const aMenu     = clone(unref(passedMenu));
        const children  = aMenu?.children?.filter(aMenu => !isFinalLink(aMenu)) || [];

        aMenu.children  = [ ...children ];
        aMenu.dataMap = {};

        if(!aMenu.href || aMenu.href === '#'){
            const contentType = menuStore.getContentType(getContentType(), unref(locale));

            if(!contentType) throw new Error(`No content type found in menu item: ${getContentType()}`);

            aMenu.href = localePath(`${contentType.slug}`);
        }

        const horizontalCardMax = siteStore?.config?.runTime?.theme?.megaMenu?.horizontalCardMax

        for (const country of countries)
            aMenu.dataMap[country] = getContentTypeData(country)
            // if(!isCardView.value)
            //     aMenu.dataMap[country] = getContentTypeData(country).slice(0,getMaxRowsPerColumn() || 6);
            // else
            //     aMenu.dataMap[country] = getContentTypeData(country).slice(0,horizontalCardMax);

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

        return siteStore?.config?.runTime?.theme?.megaMenu?.maxRowsPerColumn 
    }
    function getContentTypeData(country){
        const contentTypeName = getContentType();

        const children    = unref(passedMenu)?.children || [];
        const data        = menuStore.getContentTypeData(contentTypeName,country, locale) || [];
        const menuPaths   = unref(passedMenu)?.children?.map(aMenu => aMenu.href) || [];

        const returnData  = [...children, ...data.filter(aMenu => !menuPaths.includes(aMenu.href))]
        const showDefault = returnData.length > 5;
        const last        = unref(hasFinalLink)? [unref(hasFinalLink)] : showDefault? [getDefaultFinalLink(country)] : [];
        const horizontalCardMax = siteStore?.config?.runTime?.theme?.megaMenu?.horizontalCardMax

        if(!isCardView.value)
            return [...returnData.slice(0,getMaxRowsPerColumn() || 6), ...last]

        return [...returnData.slice(0,horizontalCardMax), ...last]
    }
</script>