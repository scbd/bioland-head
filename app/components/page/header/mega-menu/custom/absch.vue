<template>
    <div id="page-header-mega-menu-custom-absch" class="col-12 text-wrap px-0">
        <LazyPageHeaderMegaMenuHeader  :menu="menuWithChildren" />
        <section v-if="isTop" >
            <LazyPageHeaderMegaMenuLink v-for="(aMenu,j) in menuWithChildren.children" :id="`page-header-mega-menu-custom-absch-child-${j}`" :key="j" :menu="aMenu" />
        </section>
        <section v-for="(aChild,j) in drupalMenus" :id="`page-header-mega-menu-custom-absch-drupal-item-${j}`" :key="j">
            <p >
                <LazyPageHeaderMegaMenuLink :title="aChild.title"  :menu="aChild" />
            </p>
        </section>
        <section v-if="!isTop" >
            <LazyPageHeaderMegaMenuLink v-for="(aMenu,j) in menuWithChildren.children" :id="`page-header-mega-menu-custom-absch-child-${j}`" :key="j" :menu="aMenu" />
        </section>
    </div>
</template>
<script setup>
    const { t , locale } = useI18n();
    const siteStore      = useSiteStore();
    const menuStore      = useMenusStore();

    const   props              = defineProps({ menu: Object });
    const { menu: passedMenu } = toRefs(props);

    const { menu } = useMenuOverride(passedMenu, {
        defaultTitle: () => t('absch'),
        defaultHref: 'https://absch.cbd.int',
        baseClasses: ['main-nav-sub-heading', 'arrow']
    });

    const drupalMenus  = computed(() => passedMenu.value?.children || []); 
    const isTop        = computed(() => (!siteStore.biolandSettings?.megaMenu?.absch?.position || siteStore.biolandSettings?.megaMenu?.absch?.position === 'top'));

    const country        = siteStore.config?.countries?.length? [...siteStore.config.countries, siteStore.config?.country] : siteStore.config?.country;

    const { absch:data } = storeToRefs(menuStore);
    const children       = makeMenu(data.value, t, siteStore.name, country, locale.value);
    
    // Merge generated children into menu
    const menuWithChildren = computed(() => ({ ...menu.value, children: children.value }));

    function makeMenu(data,t, name, passedCountry, passedLocale){
        const locale  = unLocales.includes(passedLocale.toLocaleLowerCase())? passedLocale.toLocaleLowerCase() : 'en';
        const country = Array.isArray(passedCountry)? passedCountry.map((c)=>`&country=${c}`).join('')  : `&country=${passedCountry}`;
        const schemas = ['measure', 'absProcedure', 'absNationalModelContractualClause', 'absPermit', 'database', 'absCheckpoint'];
        const menus   = [];

        for (const schemaName in data) {
            const isDatabase = schemaName === 'database';

            if(!schemas.includes(schemaName)) continue;

            menus.push({
                            title: isDatabase? t(schemaName+`-abs`) : t(schemaName),
                            href : data[schemaName].href,
                            count: data[schemaName].count,
                            target:'_blank'
                        });
        }

        menus.push({
            title: `${name} ${t('View in ABS Portal')}`,
            href : `https://absch.cbd.int/${locale}/search?${country}`,
            class: ['main-nav-final-link'],
            target:'_blank'
        });

        return ref(menus)
    }
</script>