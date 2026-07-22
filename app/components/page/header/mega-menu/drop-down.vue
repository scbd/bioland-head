<template>
    <div v-if="sectionRows.length" id="page-header-mega-menu-dropdown" class="overflow-scroll mm">
        <button v-if="isMobile" type="button" class="mm-close-btn" @click="closeDropdown" :aria-label="t('Close menu')">
            <LazyIcon name="close" :size="1.5" />
        </button>
        <div id="page-header-mega-menu-dropdown-container" class="container px-0 cont">
            <div class="row  m-0 ">
                <div v-if="meStore.showEditMenu" id="page-header-mega-menu-dropdown-edit-alert" class="alert alert-warning p-0 text-center" role="alert">
                    <NuxtLink :to="editUrl" role="button" type="button" class="btn btn-dark btn-sm pointer">
                        <LazyIcon name="edit" style="margin-top: .3rem;" :size="2"/>
                    </NuxtLink>
                </div>
                <div class="w-100 d-flex flex-column">
                    <div
                        v-for="(row, rowIndex) in sectionRows"
                        :id="`page-header-mega-menu-dropdown-row-${rowIndex}`"
                        :key="`row-${rowIndex}`"
                        class="d-flex w-100 px-0 align-items-stretch mm-row"
                    >
                        <div
                            class="menu-section text-wrap d-flex flex-column"
                            v-for="(aMenu,index) in row"
                            :id="`page-header-mega-menu-dropdown-row-${rowIndex}-section-${index}`"
                            :key="`row-${rowIndex}-menu-${index}`"
                            :class="getSectionScaleClasses(aMenu)"
                        >
                            <div class="section-inner" :class="{'section-inner--desktop': !isMobile}">
                                <section v-if="!isComponent(aMenu)" :id="`page-header-mega-menu-dropdown-row-${rowIndex}-section-${index}-content`" class="section-content">
                                    <LazyPageHeaderMegaMenuHeader :menu="aMenu" />

                                    <div class="section-children">
                                        <section v-for="(aChild,j) in aMenu.children" :id="`page-header-mega-menu-dropdown-row-${rowIndex}-section-${index}-child-${j}`" :key="j">
                                            <LazyPageHeaderMegaMenuLink v-if="!isHeader(aChild)"  :show-thumbs="showThumbs(aMenu)" :menu="aChild" :hide-final="aChild.count===aMenu.children.length"/>
                                            <LazyPageHeaderMegaMenuHeader v-if="isHeader(aChild)"  :menu="aChild" />
                                        </section>
                                    </div>
                                </section>

                                <div v-if="isComponent(aMenu)" :id="`page-header-mega-menu-dropdown-row-${rowIndex}-section-${index}-custom`" class="section-custom">
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
        const   router   = useRouter();
        const   eventBus = useEventBus();
        const   emit     = defineEmits(['close']);
        const props      = defineProps({ menus: Array });
        const siteStore  = useSiteStore();
        const menuStore  = useMenusStore();
        const meStore    = useMeStore();
        const isPublishedSite  = computed(()=> siteStore?.config?.published);
        const maxColumns = computed(()=> siteStore.config?.runTime?.theme?.megaMenu?.maxColumns || 5);
        const viewport   = useViewport();
        const isMobile   = computed(() => !['lg','xl', 'xxl'].includes(viewport.breakpoint.value));

        const closeDropdown = () => {
            emit('close');
            eventBus.emit('closeAllMenus');
        };

        // Close on route change
        router.beforeEach(() => {
            emit('close');
        });

    
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

</script>

<style lang="scss" scoped>

@import "@/assets/scss/variables.scss";

.debug{
    border: 1px solid red;
}

// Section inner layout - desktop uses flex, mobile uses block
.section-inner {
    display: block;
}
.section-inner--desktop {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
}
.section-content {
    display: block;
}
.section-inner--desktop .section-content {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
}
.section-children {
    display: block;
}
.section-inner--desktop .section-children {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
}
.section-custom {
    display: block;
}
.section-inner--desktop .section-custom {
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
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

.mm-close-btn {
    display: none;
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
        height: auto;
        min-height: auto;
    }
    .mm{
        top: 0; 
        padding-top: 2rem;
        padding-bottom: 5rem;
        transition: all 0.4s cubic-bezier(1, 0.5, 0.8, 1);
        width: 100%;
        height: 100vh;
        min-height: 100vh;
        position: fixed;
        overflow-y: auto;
        overflow-x: hidden;
    }
    .mm-close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        top: 0.75rem;
        right: 0.75rem;
        z-index: 10001;
        width: 2.5rem;
        height: 2.5rem;
        border: none;
        border-radius: 50%;
        background-color: var(--bs-dark, #212529);
        color: white;
        cursor: pointer;
        transition: background-color 0.2s ease;
        
        &:hover {
            background-color: var(--bs-gray-700, #495057);
        }
        
        :deep(svg) {
            fill: white;
        }
    }
    .mm-row{
        flex-direction: column;
        align-items: flex-start !important;
    }
    .menu-section{
        border-right: none;
        margin-bottom: 1.5rem;
        flex: none !important;
        width: 100%;
        min-height: auto;
        height: auto;
        overflow: visible;
        padding-bottom: 0;
    }
    .menu-section :deep(.h-100),
    .menu-section :deep(.flex-fill) {
        height: auto !important;
        flex: none !important;
    }
    .menu-section :deep(.position-relative) {
        position: static !important;
    }
    .menu-section :deep(#page-header-mega-menu-custom) {
        display: block;
    }
    .menu-section :deep(#page-header-mega-menu-custom-content-type) {
        display: block;
    }
    .menu-section :deep(#page-header-mega-menu-custom-content-type-cards) {
        display: block !important;
        flex-wrap: nowrap !important;
    }
    .menu-section :deep(#page-header-mega-menu-custom-content-type-cards > section) {
        flex: none !important;
        max-width: 100% !important;
        width: 100% !important;
        padding: 0 !important;
        margin-bottom: 0.5rem;
    }
    .menu-section :deep(.card) {
        max-width: 100% !important;
        width: 100% !important;
        flex-direction: row;
    }
    .menu-section :deep(.card .card-img) {
        width: 80px !important;
        aspect-ratio: 102 / 64;
        height: auto !important;
        object-fit: cover;
        margin-right: 0.5rem;
        flex-shrink: 0;
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
