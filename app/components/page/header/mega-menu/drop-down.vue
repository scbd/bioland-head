<template>
    <div v-if="sectionRows.length" class="overflow-scroll mm">
        <div class="container px-0 cont">
            <div class="row  m-0 ">
                <div   v-if="meStore.showEditMenu"  class="alert alert-warning p-0 text-center" role="alert">
                    <NuxtLink :to="editUrl" role="button" type="button" class="btn btn-dark btn-sm pointer">
                        <LazyIcon name="edit" style="margin-top: .3rem;" :size="2"/>
                    </NuxtLink>
                </div>
                <div class="w-100 d-flex flex-column">
                    <div
                        v-for="(row, rowIndex) in sectionRows"
                        :key="`row-${rowIndex}`"
                        class="d-flex w-100 px-0 align-items-stretch mm-row"
                    >
                        <div
                            class="menu-section text-wrap d-flex flex-column"
                            v-for="(aMenu,index) in row"
                            :key="`row-${rowIndex}-menu-${index}`"
                            :class="getSectionScaleClasses(aMenu)"
                        >
                            <div class="position-relative flex-fill d-flex flex-column">
                                <section v-if="!isComponent(aMenu)" class="d-flex flex-column flex-fill">
                                    <LazyPageHeaderMegaMenuHeader :menu="aMenu" />

                                    <div class="flex-fill d-flex flex-column">
                                        <section v-for="(aChild,j) in aMenu.children" :key="j">
                                            <LazyPageHeaderMegaMenuLink v-if="!isHeader(aChild)"  :show-thumbs="showThumbs(aMenu)" :menu="aChild" :hide-final="aChild.count===aMenu.children.length"/>
                                            <LazyPageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />
                                        </section>
                                    </div>
                                </section>

                                <div v-if="isComponent(aMenu)" class="h-100 position-relative d-flex flex-column">
                                    <LazyPageHeaderMegaMenuCustom :is="componentName(aMenu)" :menu="aMenu" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
<script setup>
    import { pascalCase   } from 'change-case';

        const {t, locale} = useI18n();
        const   route    = useRoute();
        const props      = defineProps({ menus: Array });
        const siteStore  = useSiteStore();
        const menuStore  = useMenusStore();
        const meStore    = useMeStore();
        const isPublishedSite  = computed(()=> !siteStore?.config?.published);
        const maxColumns = computed(()=> siteStore.config?.runTime?.theme?.megaMenu?.maxColumns || 5);
        const viewport   = useViewport();
        const isMobile   = computed(() => !['lg','xl', 'xxl'].includes(viewport.breakpoint.value));

    
        const sections = computed(() => {

                                    if(!props?.menus?.length) return []

                                    return props.menus.filter((menu) => !isEmptySection(menu));
        });

        const sectionRows = computed(() => {

                                    if(!sections.value.length) return [];

                                    const rows = [];
                                    const columnCap = Math.max(1, Number(maxColumns.value) || 1);
                                    let currentRow = [];
                                    let currentColumns = 0;

                                    for (const aMenu of sections.value) {
                                        const span = Math.min(getMenuColumnSpan(aMenu), columnCap);

                                        if(currentRow.length && currentColumns + span > columnCap) {
                                            rows.push(currentRow);
                                            currentRow = [];
                                            currentColumns = 0;
                                        }

                                        currentRow.push(aMenu);
                                        currentColumns += span;

                                        if(currentColumns >= columnCap) {
                                            rows.push(currentRow);
                                            currentRow = [];
                                            currentColumns = 0;
                                        }
                                    }

                                    if(currentRow.length) rows.push(currentRow);

                                    return rows;
        });


        const editUrl = computed(()=> {
            const menuName = sections.value[0]?.machineName || '';

            if(!menuName) return;

            return `${siteStore.host}/admin/structure/menu/manage/${encodeURIComponent(sections.value[0]?.machineName)}?destination=${encodeURIComponent(route.path)}`
        });

        const editMenu = () => {
            const menuName = sections.value[0]?.machineName || '';

            if(!menuName) return;

            navigateTo(`${siteStore.host}/admin/structure/menu/manage/${encodeURIComponent(menuName)}`,{ external: true });

        }

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
            return getMenuColumnSpan(aMenu) >= 2;
        }

        function getMenuColumnSpan(aMenu){
            const scaleClasses = getSectionScaleClasses(aMenu);

            if(scaleClasses.includes('bl2-4x')) return 4;
            if(scaleClasses.includes('bl2-3x')) return 3;
            if(scaleClasses.includes('bl2-2x')) return 2;

            return 1;
        }


    function componentName(aMenu, short = false){
        
        const   componentNameStart          = 'LazyPageHeaderMegaMenuCustom';
        const { drupalMultisiteIdentifier } = siteStore;
        const   componentClasses            = aMenu?.class?.filter(aClass => aClass.startsWith(`${drupalMultisiteIdentifier}-component`) || aClass.startsWith(`bl2-component`) || aClass.startsWith(`mm-component`));


        if(!componentClasses?.length) return '';

        const [ componentClass ] = componentClasses.map((aName)=> (short? '' : componentNameStart)+pascalCase(getComponentVueName(aName, drupalMultisiteIdentifier)));

        if(!componentClass) return '';

        return componentClass;
    }

    function getComponentVueName(aName, drupalMultisiteIdentifier){
        if(aName.startsWith(`${drupalMultisiteIdentifier}-component-`)) return aName.replace(`${drupalMultisiteIdentifier}-component-`,'');
        if(aName.startsWith(`bl2-component-`)) return aName.replace(`bl2-component-`,'');
        if(aName.startsWith(`mm-component-`)) return aName.replace(`mm-component-`,'');

        return aName;
    }

    function getContentTypeFromClass(aName, drupalMultisiteIdentifier){
        if(aName.startsWith(`${drupalMultisiteIdentifier}-content-type-`)) return aName.replace(`${drupalMultisiteIdentifier}-content-type-`,'');
        if(aName.startsWith(`bl2-content-type-`)) return aName.replace(`bl2-content-type-`,'');
        if(aName.startsWith(`mm-content-type-`)) return aName.replace(`mm-content-type-`,'');
        return aName;
    }
    
    function getContentTypes(aMenu){
        const   siteStore                   = useSiteStore();
        const { drupalMultisiteIdentifier } = siteStore;
        const   contentTypeClasses          = aMenu?.class?.filter(aClass => aClass.startsWith(`${drupalMultisiteIdentifier}-content-type-`) || aClass.startsWith(`bl2-content-type-`) || aClass.startsWith(`mm-content-type-`));

        if(!contentTypeClasses?.length) return undefined;

        return contentTypeClasses.map((aType)=> getContentTypeFromClass(aType, drupalMultisiteIdentifier));
    }

    function getSectionScaleClasses(aMenu){
        if(!Array.isArray(aMenu?.class)) return [];

        const baseClasses = ['bl2-2x', 'bl2-3x', 'bl2-4x'];
        const xlOnlyClassesMap = {
            'bl2-2x-xl': 'bl2-2x',
            'bl2-3x-xl': 'bl2-3x',
            'bl2-4x-xl': 'bl2-4x'
        };
        const isXlViewport = ['xl', 'xxl'].includes(viewport?.breakpoint?.value);

        const classes = new Set();

        for (const className of aMenu.class) {
            if(baseClasses.includes(className)) classes.add(className);

            if(isXlViewport && xlOnlyClassesMap[className]) classes.add(xlOnlyClassesMap[className]);
        }

        return Array.from(classes);
    }

    function isComponent(aMenu){
        return componentName(aMenu);
    }

    function isHeader(menu){
        return  Array.isArray(menu?.class) && (menu?.class?.includes('mm-main-nav-sub-heading') || menu?.class?.includes('main-nav-sub-heading'));
    }

    function showThumbs(menu){
        return menu?.class?.includes('bl2-show-thumbs') || menu?.class?.includes('mm-show-thumbs');
    }

    const emptyMap = { Forums, FocalPoints, NationalReport, Absch, Bch };

    function isEmptySection(menu){

        if(!isComponent(menu) || !isPublishedSite.value) return false;

        const cName = componentName(menu, true);


        if(cName === 'ContentType') {

            if(menu?.children?.length) return false;

            let contentTypesHasDocuments = false;

            if( getContentTypes(menu)?.length) 
                for (const aType of getContentTypes(menu)) {

                    const hasRecords = menuStore?.getContentType(aType,locale)?.data?.length;

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
    function Forums(){

        return siteStore?.theme?.megaMenu?.forums? !menuStore?.forums?.length  : 3;
    }
    function hasCountry(){
        const   siteStore   = useSiteStore();

        return siteStore?.countries?.length || siteStore?.country;
    }

    // const comps=[]
    //     for (const aMenu of sections.value) {
    //         if(isComponent(aMenu)) comps.push(componentName(aMenu));
    //     }

    //     consola.error(comps)
</script>

<style lang="scss" scoped>

@import "@/assets/scss/variables.scss";

.debug{
    border: 1px solid red;
}
.menu-section{
    padding: 0 1.5rem 3rem 1rem;
    border-right: 2px solid rgb(0, 0, 0, .2);
    margin-bottom: 1rem;
    flex: 1 1 0; // same width everywhere
    min-width: 0;
    overflow: hidden;
}
.menu-section.bl2-2x { flex: 2 1 0; }
.menu-section.bl2-3x { flex: 3 1 0; }
.menu-section.bl2-4x { flex: 4 1 0; }

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
    min-height: 400px;
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
    .cont{
        height: 175vh;
    }
    .mm{
        top: 0; 
        padding-top: 2rem;
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
        width: 100%;
        height:100%;
    }
    .mm-row{
        flex-direction: column;
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
