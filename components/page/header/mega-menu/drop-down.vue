<template>
    <div class="debug overflow-scroll mm">
        <div class="container px-0 ">
            <div class="row  m-0">
                <div  class="menu-section text-wrap"  :class="[getGridValue(aMenu)]" v-for="(aMenu,index) in sections" :key="index">
                    <section v-if="!isComponent(aMenu)">
                        <PageHeaderMegaMenuHeader :menu="aMenu" />

                        <section v-for="(aChild,j) in aMenu.children" :key="j">
                            <PageHeaderMegaMenuLink v-if="!isHeader(aChild)"  :show-thumbs="showThumbs(aMenu)" :menu="aChild" />
                            <PageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />
                        </section>
                    </section>

                    <section v-if="isComponent(aMenu)" >
                        <LazyPageHeaderMegaMenuCustom :is="componentName(aMenu)" :menu="aMenu" />
                    </section>

                </div>
                
            </div>
        </div>
    </div>
</template>
<script setup>
    import { pascalCase   } from 'pascal-case';
    import { useSiteStore } from '~/stores/site';
    import { useMenusStore } from '~/stores/menus';


        const   props              = defineProps({ menus: Array });
        // const { menus    } = toRefs      (props);
        const   toggle      = ref         (false);
        const   siteStore   = useSiteStore(     );
        const viewport = useViewport();
        const isMobile = computed(() => !['lg','xl', 'xxl'].includes(viewport.breakpoint.value));
        const sections = computed(() => {

                                    if(!props?.menus?.length) return []

                                    const menusFiltered = [];

                                    for (let index = 0; index < props?.menus?.length; index++) {

                                        if(isEmptySection(props?.menus[index])) continue;

                                        menusFiltered.push(props?.menus[index]);
                                    }

                                    return menusFiltered;
        });


        function hasDoubleCol(){
            for (const aMenu of unref(sections)) 
                if(isDoubleCol(aMenu)) return true;

            return false;
        }

        function hasTwoDoubleCol(){
            let numCols = 0;
            for (const aMenu of unref(sections)) 
                if(isDoubleCol(aMenu)) numCols ++

            return numCols > 1;
        }

        function isDoubleCol(aMenu){
            const isXl = ['xl', 'xxl'].includes(viewport.breakpoint.value);

            if(aMenu.class.includes('bl2-2x')) return true;

            if(aMenu.class.includes('bl2-2x-xl') && isXl) return true;

            return false
        }

        const lengthColSizeMap = { 1: 12, 2: 6, 3: 4, 4: 3, 5: 2 }

        function getGridValue(aMenu){
            if(unref(isMobile)) return 'col-12';

            const numberOfCols  =  hasDoubleCol()? unref(sections).length +1 : unref(sections).length;
            const isDouble      = isDoubleCol(aMenu);
            const colSize       =  isDouble? lengthColSizeMap[numberOfCols] * 2 : lengthColSizeMap[numberOfCols];

            if(hasTwoDoubleCol()) return isDouble?  'col-5' : 'col-2';

            return `col-${colSize}`;
        }


    function componentName(aMenu, short = false){
        const   siteStore                   = useSiteStore(     );
        const   componentNameStart          = 'LazyPageHeaderMegaMenuCustom';
        const { drupalMultisiteIdentifier } = siteStore;
        const   componentClasses            = aMenu?.class?.filter(aClass => aClass.startsWith(`${drupalMultisiteIdentifier}-component`));

        if(!componentClasses?.length) return '';

        const [ componentClass ] = componentClasses.map((aName)=> (short? '' : componentNameStart)+pascalCase(aName.replace(`${drupalMultisiteIdentifier}-component-`,'')));

        if(!componentClass) return '';

        return componentClass
    }

    function getContentTypes(aMenu){
        const   siteStore                   = useSiteStore();
        const { drupalMultisiteIdentifier } = siteStore;
        const   contentTypeClasses          = aMenu?.class?.filter(aClass => aClass.startsWith(`${drupalMultisiteIdentifier}-content-type-`));

        if(!contentTypeClasses?.length) return undefined;

        return contentTypeClasses.map((aType)=> aType.replace(`${drupalMultisiteIdentifier}-content-type-`,''));
    }

    function isComponent(aMenu){
        return componentName(aMenu);
    }

    function hasChildrenAndValidHref(menu){
        return menu?.children?.length && menu?.href !== '#';
    }

    function isHeader(menu){
        return  Array.isArray(menu?.class) && (menu?.class?.includes('mm-main-nav-sub-heading') || menu?.class?.includes('main-nav-sub-heading'));
    }

    function showThumbs(menu){
        return menu?.class?.includes('bl2-show-thumbs') || menu?.class?.includes('mm-show-thumbs');
    }

    const emptyMap = { FocalPoints, NationalReport, Absch, Bch };

    function isEmptySection(menu){

        if(!isComponent(menu)) return false;

        const cName = componentName(menu, true);

        if(cName === 'ContentType') {

            if(menu?.children?.length) return false;

            const menuStore = useMenusStore();

            let contentTypesHasDocuments = false;

            for (const aType of getContentTypes(menu)) {
                const hasRecords = menuStore?.contentTypes[aType]?.data?.length;

                if(hasRecords) contentTypesHasDocuments = true;
            }

            if(!contentTypesHasDocuments) return true;
        }

        return emptyMap[cName]? emptyMap[cName]() : false;

    }

    function FocalPoints(){

        if(!hasCountry()) return true;

        const menuStore = useMenusStore();

        const { nfps } = menuStore;

        for (const [key, value] of Object.entries(nfps))
            if(value?.length) return false;

        return true;
    }

    function NationalReport(){

        if(!hasCountry()) return true;

        const menuStore = useMenusStore();

        const { nr, nrSix } = menuStore;

        if(Object.keys(nrSix)?.length)
            for (const [key, value] of Object.entries(nrSix))
                if(value?.length) return false;

        if(Object.keys(nr)?.length)
            for (const [key, value] of Object.entries(nr))
                if(value?.length) return false;

        return true;
    }

    function Bch(){
        const schemas = [ 'biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert'];

        if(!hasCountry()) return true;

        const menuStore = useMenusStore();

        const { bch } = menuStore;

        for (const [key, value] of Object.entries(bch))
                if(schemas.includes(key))
                    if(value?.count) return false;

        return true;
    }

    function Absch(){
        const schemas = ['measure', 'absProcedure', 'absNationalModelContractualClause', 'absPermit', 'database', 'absCheckpoint'];

        if(!hasCountry()) return true;

        const menuStore = useMenusStore();

        const { absch } = menuStore;


        for (const [key, value] of Object.entries(absch))
            if(schemas.includes(key))
                if(value?.count) return false;

        return true;
    }

    function hasCountry(){
        const   siteStore   = useSiteStore();

        return siteStore?.countries?.length || siteStore?.country;
    }
</script>

<style lang="scss" scoped>
@import "@/assets/scss/variables.scss";

.menu-section{
    border-right: 2px solid rgb(0, 0, 0, .2);
    margin-bottom: 4rem;
}
.menu-section:last-child{
    border-right: none;
}
.mm{
    position: absolute;
    padding: 1rem 0 1rem 0;
    background: $gray-100;
    box-shadow: 0 1rem 3rem $gray-700;
    width:100%;
    left: 0;
    border: 0;
    --fadeDown-distance: -1rem;
    animation: fadeDown .25s;
    z-index:10000;

}

:root {
    --fadeDown-distance: -.25em;
}

@keyframes fadeDown {
    0% {
        transform: translate(0, var(--fadeDown-distance));
        opacity: 0;
    }

    100% {
        transform: translate(0,0);
        opacity: 1;
    }
}

.mm li {
    font-size: 0.875rem;
    line-height: 1rem;
    padding-bottom: 1rem;
}

@media (max-width: 991.98px) { 
    .mm{
        top: 0; 
        padding-top: 2rem;
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
        width: 100%;
        height:100%;
    }
    .menu-section{
        border-right: none;
        margin-bottom: 1.5rem;
    }
    @keyframes fadeDown {
    0% {
        transform: translateX(75vw);
        opacity: 0;
    }

    100% {
        transform: translate(0,0);
        opacity: 1;
    }
}
}
</style>