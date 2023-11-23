<template>
    <PageHeaderMegaMenuHeader :menu="menu" />
    <div :class="{ 'd-flex justify-content-between':isCardView}">
        <section v-for="(aChild,j) in menu.children" :key="j">

                <PageHeaderMegaMenuLink v-if="!isHeader(aChild)"  :show-thumbs="menu.class?.includes('bl2-show-thumbs')" :show-cards="isCardView"  :menu="aChild" />
                <PageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />
            
        </section>
    </div>
    <PageHeaderMegaMenuLink v-if="hasFinalLink && isCardView"  :menu="hasFinalLink" />
</template>

<script setup>
    import   clone           from 'lodash.clonedeep';
    import { useMenusStore } from '~/stores/menus';

    const   props              = defineProps({ type: String, menu: Object });
    const { menu: passedMenu } = toRefs(props);
    const   menuStore          = useMenusStore();
    const   isFinalLink        = (aMenu)=> unref(aMenu)?.class?.includes('main-nav-final-link') || unref(aMenu)?.class?.includes('mm-main-nav-final-link');
    const   hasFinalLink       = computed(()=> unref(passedMenu)?.children?.find(aMenu => isFinalLink(aMenu)));
    const   viewport           = useViewport();

    
    function getDefaultFinalLink(){
        const    mediaTypes = getMediaType();
        let qString = ''
        for (const type of mediaTypes)
            qString += `&type=${type}`

        
        return {
            title: `View more`,
            href: `/media?${qString}`,
            class: ['main-nav-final-link'],
            target: ['_self']
        }
    }

    const isCardView = computed(()=> {
        const isXl = ['xl', 'xxl'].includes(viewport.breakpoint.value);
        const isShowThumbs = unref(passedMenu).class.includes('bl2-show-thumbs')
        
        if(unref(passedMenu).class.includes('bl2-2x') && isShowThumbs) return true;

        if(unref(passedMenu).class.includes('bl2-2x-xl') && isXl && isShowThumbs) return true;

        return false
    });

    const menu = computed(()=> {
        const aMenu    = clone(unref(passedMenu));
        const children = aMenu?.children?.filter(aMenu => !isFinalLink(aMenu)) || [];

        aMenu.children = [ ...children, ...getMediaTypeData() ];
consola.warn('getMediaTypeData',getMediaTypeData())
        const showDefault = aMenu.children.length > 5;
        const last        = unref(hasFinalLink)? [unref(hasFinalLink)] : showDefault? [getDefaultFinalLink()] : [];

        aMenu.children = aMenu.children.slice(0,6);
        aMenu.children = [ ...aMenu.children, ...last ];

        return aMenu;
    })


    function isHeader(m){
        const menu = unref(m);

        return  Array.isArray(menu?.class) && menu?.class?.includes('main-nav-sub-heading');
    }

    function getMediaType(){
        const classes = (unref(passedMenu)?.class?.filter(aClass => aClass.startsWith('bl2-media-type-')) || []).map((aClass)=> aClass.replace('bl2-media-type-',''));

        if(!Array.isArray(classes)) return '';

        return classes.length >1? classes : classes[0];
    }

    function getMediaTypeData(){
        const mediaTypes = Array.isArray(getMediaType())? getMediaType(): [getMediaType()];
        consola.error('contentType', mediaTypes)
        let data = []
        for (const type of mediaTypes) {
            data = [...data, ...menuStore?.mediaTypes[type]?.data || []]
        }
        // const data        = menuStore?.mediaTypes[contentType]?.data || [];
        const menuPaths   = unref(passedMenu)?.children?.map(aMenu => aMenu.href) || [];
consola.error('contentType', mediaTypes)
        return data.filter(aMenu => !menuPaths.includes(aMenu.href)).sort((a,b)=>sort(a,b, 'created'));
    }

    function sort(a,b, prop){
        if(a[prop] < b[prop]) return -1; 
        if(a[prop] > b[prop]) return 1;

        return 0;
    }
</script>