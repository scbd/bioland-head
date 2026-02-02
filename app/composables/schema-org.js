/**
 * Schema.org Composables for Bioland Head
 * 
 * Consolidated module for generating structured data (JSON-LD) for all page types.
 * Maps content types to appropriate Schema.org types and generates rich snippets.
 * 
 * Includes:
 * - useBreadcrumbsSchemaOrg: BreadcrumbList generation
 * - useHeaderSchemaOrg: WPHeader generation
 * - useFooterSchemaOrg: WPFooter generation
 * - useMainMenuSchemaOrg: SiteNavigationElement for mega menu
 * - usePageSchemaOrg: Main page schema generation
 * - useHomePageSchemaOrg: Home page with search action
 * - useSearchPageSchemaOrg: Search results page
 * 
 * Note: We don't use nuxt-schema-org because it auto-generates workTranslation
 * from ALL i18n locales (100+), but we only want the site's active locales.
 * 
 * References:
 * - https://schema.org/
 * - https://schema.org/WPHeader
 * - https://schema.org/WPFooter
 * - https://schema.org/SiteNavigationElement
 * - https://schema.org/BreadcrumbList
 */

import { pascalCase } from 'change-case';
import { contentTypes, contentTypeTidConstants } from '#shared/utils/constants';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Map of content type TIDs to Schema.org types
 * Based on the contentTypes array from constants.js
 */
const schemaTypeMap = {
    // News (tid: 2) -> NewsArticle
    [contentTypeTidConstants.NEWS]: 'NewsArticle',
    
    // Meeting or Event (tid: 3) -> Event
    [contentTypeTidConstants.MEETING_OR_EVENT]: 'Event',
    
    // Learning Resource (tid: 4) -> LearningResource
    [contentTypeTidConstants.LEARNING_RESOURCE]: 'LearningResource',
    
    // Project (tid: 5) -> Project
    [contentTypeTidConstants.PROJECT]: 'Project',
    
    // Article (tid: 6) -> Article
    [contentTypeTidConstants.ARTICLE]: 'Article',
    
    // Government Ministry or Institute (tid: 8) -> GovernmentOrganization
    [contentTypeTidConstants.GOVERNMENT_MINISTRY_OR_INSTITUTE]: 'GovernmentOrganization',
    
    // Ecosystem (tid: 9) -> Place
    [contentTypeTidConstants.ECOSYSTEM]: 'Place',
    
    // Protected Area (tid: 10) -> Place
    [contentTypeTidConstants.PROTECTED_AREA]: 'Place',
    
    // Biodiversity Data (tid: 11) -> Dataset
    [contentTypeTidConstants.BIODIVERSITY_DATA]: 'Dataset',
    
    // Document (tid: 12) -> DigitalDocument
    [contentTypeTidConstants.DOCUMENT]: 'DigitalDocument',
    
    // Related Website (tid: 13) -> WebSite
    [contentTypeTidConstants.RELATED_WEBSITE]: 'WebSite',
    
    // Other Resource (tid: 15) -> CreativeWork
    [contentTypeTidConstants.OTHER]: 'CreativeWork',
    
    // Image or Video (tid: 16) -> MediaObject
    [contentTypeTidConstants.IMAGE_OR_VIDEO]: 'MediaObject',
    
    // FAQ (tid: 43) -> FAQPage
    [contentTypeTidConstants.FAQ]: 'FAQPage',
    
    // National Information (tid: 44) -> Article
    [contentTypeTidConstants.NATIONAL_INFORMATION]: 'Article',
    
    // Status of LMO (tid: 45) -> Article
    [contentTypeTidConstants.STATUS_OF_LMOS]: 'Article',
    
    // Field Trial (tid: 46) -> Article
    [contentTypeTidConstants.FIELD_TRIAL]: 'Article',
    
    // National Mainstreaming Strategy (tid: 47) -> Article
    [contentTypeTidConstants.NATIONAL_MAINSTREAMING_STRATEGY]: 'Article',
    
    // Capacity Building (tid: 48) -> Course
    [contentTypeTidConstants.CAPACITY_BUILDING]: 'Course',
    
    // Announcement (tid: 49) -> Article
    [contentTypeTidConstants.ANNOUNCEMENT]: 'Article',
    
    // Contact (tid: 50) -> ContactPoint
    [contentTypeTidConstants.CONTACT]: 'ContactPoint',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get Schema.org type from content type TID
 * @param {number} tid - The Drupal internal term ID
 * @returns {string} - Schema.org type name
 */
function getSchemaType(tid) {
    return schemaTypeMap[tid] || 'WebPage';
}

/**
 * Get content type name from TID
 * @param {number} tid - The Drupal internal term ID
 * @returns {string|undefined} - Content type name
 */
function getContentTypeName(tid) {
    const contentType = contentTypes.find(ct => ct.drupalInternalTid === tid);
    return contentType?.name;
}

/**
 * Extract first image from page attachments
 * @param {Object} page - Page data
 * @param {string} host - Site host URL
 * @returns {string|null} - Image URL
 */
function getImageUrl(page, host) {
    const attachments = page?.fieldAttachments;
    
    if (!Array.isArray(attachments) || !attachments.length) {
        return null;
    }
    
    // Prefer hero images, then regular images
    const heroImage = attachments.find(({ type }) => type === 'media--hero');
    const regularImage = attachments.find(({ type }) => type === 'media--image');
    const image = heroImage || regularImage;
    
    if (!image?.fieldMediaImage?.uri?.url) return null;
    
    return `${host}${image.fieldMediaImage.uri.url}`;
}

/**
 * Extract videos from page attachments
 * @param {Object} page - Page data
 * @returns {Array} - Array of video embed URLs
 */
function getVideoUrls(page) {
    const attachments = page?.fieldAttachments;
    
    if (!Array.isArray(attachments) || !attachments.length) {
        return [];
    }
    
    return attachments
        .filter(({ type }) => type === 'media--remote_video')
        .map(video => video?.fieldMediaOembed)
        .filter(Boolean);
}

/**
 * Get plain text description from page body
 * @param {Object} page - Page data
 * @param {number} maxLength - Maximum length
 * @returns {string} - Plain text description
 */
function getPlainTextDescription(page, maxLength = 160) {
    const summary = page?.body?.summary || page?.description?.summary;
    if (summary) {
        return summary.substring(0, maxLength);
    }
    
    const html = page?.body?.value || page?.body?.processed || 
                 page?.description?.value || page?.description?.processed || '';
    
    if (!html) return '';
    
    // Simple HTML strip
    const plainText = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    
    return plainText.substring(0, maxLength);
}

// ============================================================================
// BREADCRUMBS SCHEMA
// ============================================================================

/**
 * Generate breadcrumb Schema.org JSON-LD from crumb data
 * @returns {object} Composable with breadcrumb schema generation functions
 */
export function useBreadcrumbsSchemaOrg() {
    const siteStore = useSiteStore();
    const { locale } = useI18n();
    const route = useRoute();
    const pageStore = usePageStore();
    const localePath = useLocalePath();

    /**
     * Generate breadcrumb JSON-LD from crumb data
     * @param {Array} crumbs - Array of breadcrumb objects { title, href, index, contentTypeId }
     * @param {string} pageTitle - Optional page title for final breadcrumb (avoids reactive store access)
     * @returns {object|null} Schema.org BreadcrumbList JSON-LD or null if no crumbs
     */
    const generateBreadcrumbSchema = (crumbs, pageTitle = null) => {
        const host = siteStore.host;
        const currentLocale = unref(locale);
        const currentPath = route.path;
        
        if (!host || !crumbs || crumbs.length === 0) {
            return null;
        }

        // Always start with Home
        const breadcrumbItems = [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: `${host}/${currentLocale}`
            }
        ];

        // Add each crumb from the computed breadcrumbs
        crumbs.forEach((crumb, index) => {
            const position = index + 2; // +2 because Home is position 1
            const crumbPath = crumb.href ? localePath(crumb.href) : null;
            
            const item = {
                '@type': 'ListItem',
                position,
                name: crumb.title
            };

            // Add item URL if href exists and is not empty
            if (crumbPath && crumbPath !== '#') {
                item.item = `${host}${crumbPath}`;
            }

            breadcrumbItems.push(item);
        });

        // Add current page as final breadcrumb if not already included
        const lastCrumbHref = crumbs[crumbs.length - 1]?.href;
        const lastCrumbPath = lastCrumbHref ? localePath(lastCrumbHref) : null;
        
        // Only add current page if it's different from the last crumb
        if (!lastCrumbPath || lastCrumbPath !== currentPath) {
            // Use provided pageTitle parameter to avoid reactive store dependency
            const finalTitle = pageTitle || pageStore.page?.title || pageStore.page?.name;
            
            if (finalTitle) {
                breadcrumbItems.push({
                    '@type': 'ListItem',
                    position: breadcrumbItems.length + 1,
                    name: finalTitle,
                    item: `${host}${currentPath}`
                });
            }
        }

        const canonicalUrl = `${host}${currentPath}`;

        return {
            '@type': 'BreadcrumbList',
            '@id': `${canonicalUrl}#breadcrumb`,
            itemListElement: breadcrumbItems
        };
    };

    /**
     * Save breadcrumb schema to the page store
     * @param {object} schema - The generated breadcrumb schema
     */
    const saveBreadcrumbSchema = (schema) => {
        pageStore.setBreadcrumbsSchemaOrg(schema);
    };

    /**
     * Get or generate breadcrumb schema
     * @param {Array} crumbs - Optional crumbs array to generate schema from
     * @returns {Promise<object|null>} Breadcrumb schema JSON-LD
     */
    const getBreadcrumbSchema = async (crumbs = null) => {
        const cachedSchema = pageStore.breadcrumbsSchemaOrg;
        
        if (cachedSchema) {
            return cachedSchema;
        }

        if (crumbs) {
            const schema = generateBreadcrumbSchema(crumbs);
            if (schema) {
                saveBreadcrumbSchema(schema);
                return schema;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        
        return pageStore.breadcrumbsSchemaOrg;
    };

    /**
     * Get breadcrumb schema synchronously (for SSR)
     * @returns {object|null} Breadcrumb schema JSON-LD
     */
    const getBreadcrumbSchemaSync = () => {
        return pageStore.breadcrumbsSchemaOrg;
    };

    return {
        generateBreadcrumbSchema,
        saveBreadcrumbSchema,
        getBreadcrumbSchema,
        getBreadcrumbSchemaSync
    };
}

// ============================================================================
// HEADER SCHEMA (WPHeader)
// ============================================================================

/**
 * Generate header Schema.org JSON-LD
 * @returns {object} Composable with header schema generation functions
 */
export function useHeaderSchemaOrg() {
    const siteStore = useSiteStore();
    const pageStore = usePageStore();
    const { locale } = useI18n();
    const route = useRoute();

    /**
     * Generate WPHeader JSON-LD
     * @returns {object|null} Schema.org WPHeader JSON-LD
     */
    const generateHeaderSchema = () => {
        const host = siteStore.host;
        const currentLocale = unref(locale);
        const currentPath = route.path;
        
        if (!host) return null;

        const canonicalUrl = `${host}${currentPath}`;
        const siteName = siteStore.name + ' National Clearing-House, Convention on Biological Diversity';
        const logoUri = siteStore.getLogoUri;

        const headerSchema = {
            '@type': 'WPHeader',
            '@id': `${canonicalUrl}#header`,
            cssSelector: '#page-header',
            name: siteName,
            url: `${host}/${currentLocale}`,
            inLanguage: currentLocale,
            isPartOf: { '@id': `${host}/#website` }
        };

        if (logoUri) {
            headerSchema.image = logoUri;
        }

        return headerSchema;
    };

    /**
     * Save header schema to the page store
     * @param {object} schema - The generated header schema
     */
    const saveHeaderSchema = (schema) => {
        pageStore.setHeaderSchemaOrg(schema);
    };

    /**
     * Get or generate header schema
     * @returns {Promise<object|null>} Header schema JSON-LD
     */
    const getHeaderSchema = async () => {
        const cachedSchema = pageStore.headerSchemaOrg;
        
        if (cachedSchema) {
            return cachedSchema;
        }

        const schema = generateHeaderSchema();
        if (schema) {
            saveHeaderSchema(schema);
            return schema;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        
        return pageStore.headerSchemaOrg;
    };

    /**
     * Get header schema synchronously (for SSR)
     * Note: Does NOT save to store to avoid reactive loops when called from useHead()
     * @returns {object|null} Header schema JSON-LD
     */
    const getHeaderSchemaSync = () => {
        // Return cached if available, otherwise generate fresh (but don't cache)
        const cachedSchema = pageStore.headerSchemaOrg;
        
        if (cachedSchema) {
            return cachedSchema;
        }

        // Generate and return without saving to store
        return generateHeaderSchema();
    };

    return {
        generateHeaderSchema,
        saveHeaderSchema,
        getHeaderSchema,
        getHeaderSchemaSync
    };
}

// ============================================================================
// FOOTER SCHEMA (WPFooter)
// ============================================================================

/**
 * Generate footer Schema.org JSON-LD
 * @returns {object} Composable with footer schema generation functions
 */
export function useFooterSchemaOrg() {
    const siteStore = useSiteStore();
    const pageStore = usePageStore();
    const menusStore = useMenusStore();
    const { locale, t } = useI18n();
    const route = useRoute();

    /**
     * Generate SiteNavigationElement for a menu column
     * @param {object} menu - Menu object with title and children
     * @param {string} host - Site host URL
     * @param {string} position - Position in the footer
     * @returns {object} SiteNavigationElement schema
     */
    const generateNavElement = (menu, host, position) => {
        if (!menu?.title) return null;

        return {
            '@type': 'SiteNavigationElement',
            name: menu.title,
            position,
            ...(menu.children?.length ? {
                hasPart: menu.children.map((child, index) => ({
                    '@type': 'SiteNavigationElement',
                    name: child.title,
                    url: child.href?.startsWith('http') ? child.href : `${host}${child.href}`,
                    position: index + 1
                }))
            } : {})
        };
    };

    /**
     * Generate WPFooter JSON-LD
     * @returns {object|null} Schema.org WPFooter JSON-LD
     */
    const generateFooterSchema = () => {
        const host = siteStore.host;
        const currentLocale = unref(locale);
        const currentPath = route.path;
        
        if (!host) return null;

        const canonicalUrl = `${host}${currentPath}`;
        const footerMenus = menusStore.footer || [];

        const footerSchema = {
            '@type': 'WPFooter',
            '@id': `${canonicalUrl}#footer`,
            cssSelector: 'footer',
            name: 'Site Footer',
            description: 'Footer navigation and organization information',
            inLanguage: currentLocale,
            isPartOf: { '@id': `${host}/#website` },
            publisher: {
                '@type': 'Organization',
                '@id': 'https://www.cbd.int/#organization',
                name: 'Secretariat of the Convention on Biological Diversity',
                url: 'https://www.cbd.int',
                logo: {
                    '@type': 'ImageObject',
                    url: `${host}/images/cbd-logo-white.svg`
                },
                parentOrganization: {
                    '@type': 'Organization',
                    name: 'United Nations',
                    url: 'https://www.un.org',
                    logo: {
                        '@type': 'ImageObject',
                        url: `${host}/images/UN_emblem_blue.svg`
                    }
                }
            },
            copyrightHolder: {
                '@type': 'Organization',
                name: 'Secretariat of the Convention on Biological Diversity'
            }
        };

        if (footerMenus.length > 0) {
            const navElements = footerMenus
                .map((menu, index) => generateNavElement(menu, host, index + 1))
                .filter(Boolean);

            if (navElements.length > 0) {
                footerSchema.hasPart = navElements;
            }
        }

        return footerSchema;
    };

    /**
     * Save footer schema to the page store
     * @param {object} schema - The generated footer schema
     */
    const saveFooterSchema = (schema) => {
        pageStore.setFooterSchemaOrg(schema);
    };

    /**
     * Get or generate footer schema
     * @returns {Promise<object|null>} Footer schema JSON-LD
     */
    const getFooterSchema = async () => {
        const cachedSchema = pageStore.footerSchemaOrg;
        
        if (cachedSchema) {
            return cachedSchema;
        }

        const schema = generateFooterSchema();
        if (schema) {
            saveFooterSchema(schema);
            return schema;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        
        return pageStore.footerSchemaOrg;
    };

    /**
     * Get footer schema synchronously (for SSR)
     * Note: Does NOT save to store to avoid reactive loops when called from useHead()
     * @returns {object|null} Footer schema JSON-LD
     */
    const getFooterSchemaSync = () => {
        // Return cached if available, otherwise generate fresh (but don't cache)
        const cachedSchema = pageStore.footerSchemaOrg;
        
        if (cachedSchema) {
            return cachedSchema;
        }

        // Generate and return without saving to store
        return generateFooterSchema();
    };

    return {
        generateFooterSchema,
        saveFooterSchema,
        getFooterSchema,
        getFooterSchemaSync
    };
}

// ============================================================================
// MAIN MENU SCHEMA (SiteNavigationElement)
// ============================================================================

/**
 * Generate main menu Schema.org JSON-LD
 * Recursively processes menu structure to capture all navigation links,
 * including custom component links from menusStore data.
 * @returns {object} Composable with main menu schema generation functions
 */
export function useMainMenuSchemaOrg() {
    const siteStore = useSiteStore();
    const pageStore = usePageStore();
    const menusStore = useMenusStore();
    const { locale, t } = useI18n();
    const route = useRoute();
    const localePath = useLocalePath();

    /**
     * Generate a URL from href
     * @param {string} href - The href value
     * @param {string} host - Site host
     * @returns {string|null} Full URL or null
     */
    const buildUrl = (href, host) => {
        if (!href || href === '#') return null;
        if (href.startsWith('http')) return href;
        const localized = localePath(href);
        return `${host}${localized}`;
    };

    /**
     * Detect custom component name from menu classes
     * @param {object} aMenu - Menu item
     * @returns {string|null} Component name or null
     */
    const getCustomComponentName = (aMenu) => {
        const { drupalMultisiteIdentifier } = siteStore;
        const componentClasses = aMenu?.class?.filter(aClass => 
            aClass.startsWith(`${drupalMultisiteIdentifier}-component`) || 
            aClass.startsWith('bl2-component') || 
            aClass.startsWith('mm-component')
        );

        if (!componentClasses?.length) return null;

        const [componentClass] = componentClasses.map(aName => {
            if (aName.startsWith(`${drupalMultisiteIdentifier}-component-`)) return aName.replace(`${drupalMultisiteIdentifier}-component-`, '');
            if (aName.startsWith('bl2-component-')) return aName.replace('bl2-component-', '');
            if (aName.startsWith('mm-component-')) return aName.replace('mm-component-', '');
            return aName;
        });

        return componentClass ? pascalCase(componentClass) : null;
    };

    /**
     * Get content type from menu classes
     * @param {object} aMenu - Menu item
     * @returns {string|null} Content type name or null
     */
    const getContentTypeFromMenu = (aMenu) => {
        const { drupalMultisiteIdentifier } = siteStore;
        const contentTypeClasses = aMenu?.class?.filter(aClass => 
            aClass.startsWith(`${drupalMultisiteIdentifier}-content-type-`) || 
            aClass.startsWith('bl2-content-type-') || 
            aClass.startsWith('mm-content-type-')
        );

        if (!contentTypeClasses?.length) return null;

        return contentTypeClasses.map(aName => {
            if (aName.startsWith(`${drupalMultisiteIdentifier}-content-type-`)) return aName.replace(`${drupalMultisiteIdentifier}-content-type-`, '');
            if (aName.startsWith('bl2-content-type-')) return aName.replace('bl2-content-type-', '');
            if (aName.startsWith('mm-content-type-')) return aName.replace('mm-content-type-', '');
            return aName;
        });
    };

    /**
     * Generate links for ABSCH custom component
     */
    const generateAbschLinks = (aMenu, host, currentLocale) => {
        const links = [];
        const data = menusStore.absch || {};
        const country = siteStore.config?.countries?.length 
            ? [...siteStore.config.countries, siteStore.config?.country] 
            : siteStore.config?.country;
        const localeForUrl = ['en', 'fr', 'es', 'ar', 'ru', 'zh'].includes(currentLocale.toLowerCase()) 
            ? currentLocale.toLowerCase() 
            : 'en';
        const countryQuery = Array.isArray(country) 
            ? country.map(c => `&country=${c}`).join('') 
            : `&country=${country}`;

        const schemas = ['measure', 'absProcedure', 'absNationalModelContractualClause', 'absPermit', 'database', 'absCheckpoint'];
        
        for (const schemaName of schemas) {
            if (data[schemaName]) {
                links.push({
                    title: schemaName === 'database' ? t(schemaName + '-abs') : t(schemaName),
                    href: data[schemaName].href,
                    target: '_blank'
                });
            }
        }

        links.push({
            title: `${siteStore.name} ${t('View in ABS Portal')}`,
            href: `https://absch.cbd.int/${localeForUrl}/search?${countryQuery}`,
            target: '_blank'
        });

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        return links;
    };

    /**
     * Generate links for BCH custom component
     */
    const generateBchLinks = (aMenu, host, currentLocale) => {
        const links = [];
        const data = menusStore.bch || {};
        const country = siteStore.config?.countries?.length 
            ? [...siteStore.config.countries, siteStore.config?.country] 
            : siteStore.config?.country;
        const localeForUrl = ['en', 'fr', 'es', 'ar', 'ru', 'zh'].includes(currentLocale.toLowerCase()) 
            ? currentLocale.toLowerCase() 
            : 'en';
        const countryQuery = Array.isArray(country) 
            ? country.map(c => `&country=${c}`).join('') 
            : `&country=${country}`;

        const schemas = ['biosafetyLaw', 'biosafetyDecision', 'nationalRiskAssessment', 'database', 'nationalReport', 'biosafetyExpert'];
        
        for (const schemaName of schemas) {
            if (data[schemaName]) {
                links.push({
                    title: t(schemaName),
                    href: data[schemaName].href,
                    target: '_blank'
                });
            }
        }

        links.push({
            title: `${siteStore.name} ${t('View in BCH Portal')}`,
            href: `https://bch.cbd.int/${localeForUrl}/search?currentPage=1${countryQuery}`,
            target: '_blank'
        });

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        return links;
    };

    /**
     * Generate links for Forums custom component
     */
    const generateForumsLinks = (aMenu) => {
        const links = [];
        const forumTopics = menusStore.forums || [];

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        for (const topic of forumTopics) {
            if (topic?.title) {
                links.push({
                    title: topic.title,
                    href: topic.href || `/node/${topic.nodeId}`
                });
            }
        }

        return links;
    };

    /**
     * Generate links for Focal Points custom component
     */
    const generateFocalPointsLinks = (aMenu) => {
        const links = [];
        const nfps = menusStore.nfps || {};

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        for (const [country, countryLinks] of Object.entries(nfps)) {
            if (Array.isArray(countryLinks)) {
                links.push(...countryLinks.filter(c => c?.title));
            }
        }

        return links;
    };

    /**
     * Generate links for Country Profiles custom component
     */
    const generateCountryProfilesLinks = (currentLocale) => {
        const links = [];
        const countries = siteStore.countries || [];

        for (const countryCode of countries) {
            links.push(
                { title: t('Convention on Biological Diversity') + ' ' + t('Country Profile'), href: `https://www.cbd.int/countries/?country=${countryCode}`, target: '_blank' },
                { title: t('BCH') + ' ' + t('Country Profile'), href: `https://bch.cbd.int/en/countries/${countryCode}`, target: '_blank' },
                { title: t('ABSCH') + ' ' + t('Country Profile'), href: `https://absch.cbd.int/en/countries/${countryCode}`, target: '_blank' },
                { title: t('UN') + ' ' + t('Country Profile'), href: `https://data.un.org/en/iso/${countryCode}.html`, target: '_blank' }
            );
        }

        return links;
    };

    /**
     * Generate links for All Content Types custom component
     */
    const generateAllContentTypesLinks = (aMenu) => {
        const links = [];
        const contentTypesData = menusStore.contentTypes || {};

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        for (const [name, data] of Object.entries(contentTypesData)) {
            if (data?.count) {
                links.push({
                    title: data.name,
                    href: `/taxonomy/term/${data.drupalInternalId}`
                });
            }
        }

        return links;
    };

    /**
     * Generate links for National Targets 7 custom component
     */
    const generateNationalTargets7Links = (aMenu) => {
        const links = [];
        const nt7 = menusStore.nt7 || {};

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        for (const [country, targets] of Object.entries(nt7)) {
            if (Array.isArray(targets)) {
                for (const target of targets) {
                    if (target?.title || target?.name) {
                        links.push({
                            title: target.title || target.name,
                            href: target.href || target.path?.alias
                        });
                    }
                }
            }
        }

        return links;
    };

    /**
     * Generate links for National Report custom component
     */
    const generateNationalReportLinks = (aMenu) => {
        const links = [];
        const nr = menusStore.nr || {};
        const nrSix = menusStore.nrSix || {};

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        for (const [country, reports] of Object.entries(nr)) {
            if (Array.isArray(reports)) {
                links.push(...reports.filter(r => r?.title));
            }
        }

        for (const [country, reports] of Object.entries(nrSix)) {
            if (Array.isArray(reports)) {
                links.push(...reports.filter(r => r?.title));
            }
        }

        return links;
    };

    /**
     * Generate links for Content Type custom component
     */
    const generateContentTypeLinks = (aMenu, currentLocale) => {
        const links = [];
        const contentTypeNames = getContentTypeFromMenu(aMenu);
        
        if (!contentTypeNames?.length) return links;

        if (aMenu.children?.length) {
            links.push(...aMenu.children.filter(c => c?.title));
        }

        const countries = siteStore.countries || [];
        for (const contentTypeName of contentTypeNames) {
            for (const country of countries) {
                const data = menusStore.getContentTypeData?.(contentTypeName, country, currentLocale) || [];
                links.push(...data.filter(d => d?.title));
            }
        }

        return links;
    };

    /**
     * Generate schema for custom component section
     */
    const generateCustomComponentSchema = (aMenu, host, baseElementId, position, currentLocale) => {
        const componentName = getCustomComponentName(aMenu);
        if (!componentName) return null;

        let links = [];
        let elementId = baseElementId;
        const name = aMenu.title || componentName;

        switch (componentName) {
            case 'Absch':
                links = generateAbschLinks(aMenu, host, currentLocale);
                elementId = 'page-header-mega-menu-custom-absch';
                break;
            case 'Bch':
                links = generateBchLinks(aMenu, host, currentLocale);
                elementId = 'page-header-mega-menu-custom-bch';
                break;
            case 'Forums':
                links = generateForumsLinks(aMenu);
                elementId = 'page-header-mega-menu-custom-forums';
                break;
            case 'FocalPoints':
                links = generateFocalPointsLinks(aMenu);
                elementId = 'page-header-mega-menu-custom-focal-points';
                break;
            case 'CountryProfiles':
                links = generateCountryProfilesLinks(currentLocale);
                elementId = 'page-header-mega-menu-custom-country-profiles';
                break;
            case 'AllContentTypes':
                links = generateAllContentTypesLinks(aMenu);
                elementId = 'page-header-mega-menu-custom-all-content-types';
                break;
            case 'NationalTargets_7':
            case 'NationalTargets7':
                links = generateNationalTargets7Links(aMenu);
                elementId = 'page-header-mega-menu-custom-national-targets-7';
                break;
            case 'NationalReport':
                links = generateNationalReportLinks(aMenu);
                elementId = 'page-header-mega-menu-custom-national-report';
                break;
            case 'ContentType':
                links = generateContentTypeLinks(aMenu, currentLocale);
                elementId = 'page-header-mega-menu-custom-content-type';
                break;
            default:
                if (aMenu.children?.length) {
                    links = aMenu.children.filter(c => c?.title);
                }
        }

        const schema = {
            '@type': 'SiteNavigationElement',
            '@id': `${host}/${currentLocale}#${elementId}`,
            cssSelector: `#${elementId}`,
            xpath: `//*[@id='${elementId}']`,
            name,
            position,
            inLanguage: currentLocale
        };

        const headerUrl = buildUrl(aMenu.href, host);
        if (headerUrl) {
            schema.url = headerUrl;
        }

        if (links.length) {
            schema.hasPart = links.map((link, idx) => {
                const linkId = `${elementId}-item-${idx}`;
                const linkSchema = {
                    '@type': 'SiteNavigationElement',
                    '@id': `${host}/${currentLocale}#${linkId}`,
                    cssSelector: `#${linkId}`,
                    xpath: `//*[@id='${linkId}']`,
                    name: link.title,
                    position: idx + 1,
                    inLanguage: currentLocale
                };

                const linkUrl = buildUrl(link.href, host);
                if (linkUrl) {
                    linkSchema.url = linkUrl;
                }

                return linkSchema;
            });
        }

        return schema;
    };

    /**
     * Generate SiteNavigationElement for a single link
     */
    const generateLinkSchema = (link, host, elementId, position, currentLocale) => {
        const url = buildUrl(link.href, host);
        
        const schema = {
            '@type': 'SiteNavigationElement',
            '@id': `${host}/${currentLocale}#${elementId}`,
            cssSelector: `#${elementId}`,
            xpath: `//*[@id='${elementId}']`,
            name: link.title,
            position,
            inLanguage: currentLocale
        };

        if (url) {
            schema.url = url;
        }

        if (link.children?.length) {
            const childSchemas = link.children
                .filter(child => child?.title)
                .map((child, idx) => generateLinkSchema(
                    child,
                    host,
                    `${elementId}-child-${idx}`,
                    idx + 1,
                    currentLocale
                ));
            
            if (childSchemas.length) {
                schema.hasPart = childSchemas;
            }
        }

        return schema;
    };

    /**
     * Generate SiteNavigationElement for a dropdown section
     */
    const generateSectionSchema = (section, host, navItemIndex, rowIndex, sectionIndex, currentLocale) => {
        const componentName = getCustomComponentName(section);
        if (componentName) {
            const baseElementId = `page-header-mega-menu-dropdown-row-${rowIndex}-section-${sectionIndex}-custom`;
            return generateCustomComponentSchema(section, host, baseElementId, sectionIndex + 1, currentLocale);
        }

        const elementId = `page-header-mega-menu-dropdown-row-${rowIndex}-section-${sectionIndex}`;
        
        const schema = {
            '@type': 'SiteNavigationElement',
            '@id': `${host}/${currentLocale}#${elementId}`,
            cssSelector: `#${elementId}`,
            xpath: `//*[@id='${elementId}']`,
            name: section.title || 'Menu Section',
            position: sectionIndex + 1,
            inLanguage: currentLocale
        };

        const sectionUrl = buildUrl(section.href, host);
        if (sectionUrl) {
            schema.url = sectionUrl;
        }

        if (section.children?.length) {
            const linkSchemas = section.children
                .filter(child => child?.title)
                .map((child, idx) => {
                    const linkElementId = `page-header-mega-menu-dropdown-row-${rowIndex}-section-${sectionIndex}-child-${idx}`;
                    return generateLinkSchema(child, host, linkElementId, idx + 1, currentLocale);
                });

            if (linkSchemas.length) {
                schema.hasPart = linkSchemas;
            }
        }

        return schema;
    };

    /**
     * Organize sections into rows (matching drop-down.vue logic)
     */
    const organizeSectionsIntoRows = (sections, maxColumns = 5) => {
        const rows = [];
        let currentRow = [];
        let currentColumns = 0;

        const getSpan = (section) => {
            const classes = section.class || [];
            if (classes.includes('bl2-4x')) return 4;
            if (classes.includes('bl2-3x')) return 3;
            if (classes.includes('bl2-2x') || classes.includes('mm-double')) return 2;
            return 1;
        };

        for (const section of sections) {
            const span = Math.min(getSpan(section), maxColumns);

            if (currentRow.length && currentColumns + span > maxColumns) {
                rows.push(currentRow);
                currentRow = [];
                currentColumns = 0;
            }

            currentRow.push(section);
            currentColumns += span;

            if (currentColumns >= maxColumns) {
                rows.push(currentRow);
                currentRow = [];
                currentColumns = 0;
            }
        }

        if (currentRow.length) rows.push(currentRow);

        return rows;
    };

    /**
     * Generate SiteNavigationElement for a top-level nav item
     */
    const generateNavItemSchema = (menuItem, host, index, currentLocale) => {
        if (menuItem.class?.includes('login')) return null;
        
        const elementId = `page-header-mega-menu-nav-item-${index}`;
        
        const schema = {
            '@type': 'SiteNavigationElement',
            '@id': `${host}/${currentLocale}#${elementId}`,
            cssSelector: `#${elementId}`,
            xpath: `//*[@id='${elementId}']`,
            name: menuItem.title,
            position: index + 1,
            inLanguage: currentLocale
        };

        const url = buildUrl(menuItem.href, host);
        if (url) {
            schema.url = url;
        }

        if (menuItem.children?.length) {
            const validSections = menuItem.children.filter(section => 
                section?.title || section?.children?.length || getCustomComponentName(section)
            );

            if (validSections.length) {
                const maxColumns = siteStore.config?.runTime?.theme?.megaMenu?.maxColumns || 5;
                const rows = organizeSectionsIntoRows(validSections, maxColumns);
                
                const sectionSchemas = [];
                rows.forEach((row, rowIndex) => {
                    row.forEach((section, sectionIndex) => {
                        const sectionSchema = generateSectionSchema(
                            section,
                            host,
                            index,
                            rowIndex,
                            sectionIndex,
                            currentLocale
                        );
                        if (sectionSchema) {
                            sectionSchemas.push(sectionSchema);
                        }
                    });
                });

                if (sectionSchemas.length) {
                    schema.hasPart = sectionSchemas;
                }
            }
        }

        return schema;
    };

    /**
     * Generate the complete main menu Schema.org JSON-LD
     * @returns {object|null} Schema.org SiteNavigationElement JSON-LD
     */
    const generateMainMenuSchema = () => {
        const host = siteStore.host;
        const currentLocale = unref(locale);
        const currentPath = route.path;
        const mainMenus = menusStore.main;
        
        if (!host || !mainMenus?.length) return null;

        const canonicalUrl = `${host}${currentPath}`;

        const mainNavSchema = {
            '@type': 'SiteNavigationElement',
            '@id': `${host}/${currentLocale}#page-header-mega-menu-nav`,
            cssSelector: '#page-header-mega-menu-nav',
            xpath: "//*[@id='page-header-mega-menu-nav']",
            name: 'Main Navigation',
            inLanguage: currentLocale,
            isPartOf: { '@id': `${canonicalUrl}#page-header` }
        };

        const navItemSchemas = mainMenus
            .map((item, index) => generateNavItemSchema(item, host, index, currentLocale))
            .filter(Boolean);

        if (navItemSchemas.length) {
            mainNavSchema.hasPart = navItemSchemas;
        }

        return mainNavSchema;
    };

    /**
     * Save main menu schema to the page store
     */
    const saveMainMenuSchema = (schema) => {
        pageStore.setMainMenuSchemaOrg(schema);
    };

    /**
     * Get or generate main menu schema
     * @returns {Promise<object|null>} Main menu schema JSON-LD
     */
    const getMainMenuSchema = async () => {
        const cachedSchema = pageStore.mainMenuSchemaOrg;
        
        if (cachedSchema) {
            return cachedSchema;
        }

        const schema = generateMainMenuSchema();
        if (schema) {
            saveMainMenuSchema(schema);
            return schema;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        
        return pageStore.mainMenuSchemaOrg;
    };

    /**
     * Get main menu schema synchronously (for SSR)
     * Note: Does NOT save to store to avoid reactive loops when called from useHead()
     * @returns {object|null} Main menu schema JSON-LD
     */
    const getMainMenuSchemaSync = () => {
        // Return cached if available, otherwise generate fresh (but don't cache)
        const cachedSchema = pageStore.mainMenuSchemaOrg;
        
        if (cachedSchema) {
            return cachedSchema;
        }

        // Generate and return without saving to store
        return generateMainMenuSchema();
    };

    return {
        generateMainMenuSchema,
        saveMainMenuSchema,
        getMainMenuSchema,
        getMainMenuSchemaSync
    };
}

// ============================================================================
// PAGE SCHEMA (Main)
// ============================================================================

/**
 * Main Schema.org composable - sets up structured data for the current page
 * Call this from your page components to automatically generate JSON-LD
 * 
 * Note: Manually generates JSON-LD for full control over output
 */
export function usePageSchemaOrg() {
    const siteStore = useSiteStore();
    const pageStore = usePageStore();
    const { locale } = useI18n();
    const { getBreadcrumbSchemaSync } = useBreadcrumbsSchemaOrg();
    const { getHeaderSchemaSync } = useHeaderSchemaOrg();
    const { getFooterSchemaSync } = useFooterSchemaOrg();
    const { getMainMenuSchemaSync } = useMainMenuSchemaOrg();
    
    useHead(() => {
        const page = pageStore.page;
        const currentLocale = unref(locale);
        const host = siteStore.host;
        const siteName = siteStore.name + ' National Clearing-House, Convention on Biological Diversity';
        
        if (!page || !Object.keys(page).length || !host) {
            return {};
        }
        
        const typeId = pageStore.typeId;
        const schemaType = getSchemaType(typeId);
        const typeName = getContentTypeName(typeId);
        
        // Construct canonical URL from path
        const canonicalPath = page?.path?.alias ? `/${currentLocale}${page.path.alias}` : `/${currentLocale}`;
        const canonicalUrl = `${host}${canonicalPath}`;
        
        // Get significant links from fieldUrl array
        const significantLinks = page?.fieldUrl?.length ? page.fieldUrl : null;
        
        // Get main image from pageStore.media (first media--image type)
        const mainMedia = Array.isArray(pageStore.media) 
            ? pageStore.media.find(media => media?.type === 'media--image')
            : null;
        const mainImageUrl = mainMedia?.fieldMediaImage?.uri?.url 
            ? `${host}${mainMedia.fieldMediaImage.uri.url}` 
            : getImageUrl(page, host);
        
        const imageUrl = mainImageUrl || siteStore.getLogoUri;
        const videoUrls = getVideoUrls(page);
        const title = page?.title || page?.name;
        const description = getPlainTextDescription(page);
        const datePublished = page?.fieldPublished || page?.created;
        const dateModified = page?.changed;
        
        const breadcrumbSchema = getBreadcrumbSchemaSync();
        const headerSchema = getHeaderSchemaSync();
        const footerSchema = getFooterSchemaSync();
        const mainMenuSchema = getMainMenuSchemaSync();
        
        const graph = [
            {
                '@type': 'WebSite',
                '@id': `${host}/#website`,
                identifier: `${host}/`,
                name: siteName,
                description: `${siteName} Clearing-House Mechanism`,
                url: `${host}/`,
                inLanguage: currentLocale,
                cssSelector: 'body',
                xpath: '/html/body',
                image: imageUrl,
                publisher: { '@id': 'https://www.cbd.int/#identity' },
            },
            {
                '@type': 'Organization',
                '@id': 'https://www.cbd.int/#identity',
                identifier: 'https://www.cbd.int/',
                name: 'Secretary of the Convention on Biological Diversity',
                url: 'https://www.cbd.int/',
                logo: 'https://www.cbd.int/themes/custom/bootstrap_sass/images/CBD_logo_green.png',
            },
        ];
        
        if (breadcrumbSchema) {
            graph.push(breadcrumbSchema);
        }
        
        if (headerSchema) {
            if (mainMenuSchema) {
                headerSchema.hasPart = { '@id': mainMenuSchema['@id'] };
            }
            graph.push(headerSchema);
        }
        
        if (mainMenuSchema) {
            graph.push(mainMenuSchema);
        }
        
        if (footerSchema) {
            graph.push(footerSchema);
        }
        
        const baseProps = {
            '@id': `${canonicalUrl}#primary`,
            identifier: `${canonicalUrl}#page-body`,
            name: title,
            description,
            url: canonicalUrl,
            inLanguage: currentLocale,
            datePublished,
            dateModified,
            ...(imageUrl ? { image: imageUrl } : {}),
            ...(significantLinks ? { significantLink: significantLinks } : {}),
            isPartOf: { '@id': `${host}/#website` },
        };
        
        switch (schemaType) {
            case 'NewsArticle':
            case 'Article':
                graph.push({
                    '@type': schemaType,
                    ...baseProps,
                    headline: title,
                    articleSection: typeName,
                });
                break;
                
            case 'Event':
                graph.push({
                    '@type': 'Event',
                    ...baseProps,
                    startDate: page?.fieldStartDate,
                    endDate: page?.fieldEndDate,
                    eventStatus: 'https://schema.org/EventScheduled',
                });
                break;
                
            case 'LearningResource':
            case 'Course':
                graph.push({
                    '@type': 'Course',
                    ...baseProps,
                });
                break;
                
            case 'GovernmentOrganization':
                graph.push({
                    '@type': 'GovernmentOrganization',
                    ...baseProps,
                });
                break;
                
            case 'Place':
                graph.push({
                    '@type': 'Place',
                    ...baseProps,
                    ...(page?.fieldGeo ? {
                        geo: {
                            '@type': 'GeoCoordinates',
                            latitude: page.fieldGeo.lat,
                            longitude: page.fieldGeo.lon,
                        }
                    } : {}),
                });
                break;
                
            case 'MediaObject':
                if (videoUrls.length) {
                    graph.push({
                        '@type': 'VideoObject',
                        ...baseProps,
                        embedUrl: videoUrls[0],
                    });
                } else if (imageUrl) {
                    graph.push({
                        '@type': 'ImageObject',
                        ...baseProps,
                        contentUrl: imageUrl,
                    });
                } else {
                    graph.push({ '@type': 'WebPage', ...baseProps });
                }
                break;
                
            case 'FAQPage':
                graph.push({
                    '@type': 'FAQPage',
                    ...baseProps,
                });
                break;
                
            case 'ContactPoint':
                graph.push({
                    '@type': 'Organization',
                    '@id': 'https://www.cbd.int/#identity',
                    identifier: 'https://www.cbd.int/',
                    name: 'Secretary of the Convention on Biological Diversity',
                    url: 'https://www.cbd.int/',
                    logo: 'https://www.cbd.int/themes/custom/bootstrap_sass/images/CBD_logo_green.png',
                    contactPoint: {
                        '@type': 'ContactPoint',
                        name: title,
                        email: page?.fieldEmail,
                        telephone: page?.fieldPhone,
                        contactType: 'customer service',
                    },
                });
                break;
                
            default:
                graph.push({ '@type': 'WebPage', ...baseProps });
        }
        
        videoUrls.forEach((embedUrl, index) => {
            if (index > 0) {
                graph.push({
                    '@type': 'VideoObject',
                    '@id': `${canonicalUrl}#video-${index}`,
                    name: title,
                    embedUrl,
                });
            }
        });
        
        const schema = {
            '@context': 'https://schema.org',
            '@graph': graph,
        };
        
        return {
            script: [
                {
                    type: 'application/ld+json',
                    innerHTML: JSON.stringify(schema),
                },
            ],
        };
    });
}

// ============================================================================
// HOME PAGE SCHEMA
// ============================================================================

/**
 * Composable for home page schema
 * Adds WebSite schema with search action
 * 
 * Note: We manually generate workTranslation using useHead to avoid
 * nuxt-schema-org's automatic i18n integration which includes all 100+ locales
 */
export function useHomePageSchemaOrg() {
    const siteStore = useSiteStore();
    const { locale } = useI18n();
    const { getHeaderSchemaSync } = useHeaderSchemaOrg();
    const { getFooterSchemaSync } = useFooterSchemaOrg();
    const { getMainMenuSchemaSync } = useMainMenuSchemaOrg();
    
    useHead(() => {
        const activeLocales = siteStore.allLocales || [];
        const currentLocale = unref(locale);
        const host = siteStore.host;
        const siteName = siteStore.name + ' National Clearing-House, Convention on Biological Diversity';
        
        if (!host) return {};
        
        const headerSchema = getHeaderSchemaSync();
        const footerSchema = getFooterSchemaSync();
        const mainMenuSchema = getMainMenuSchemaSync();
        
        const workTranslation = activeLocales
            .filter(loc => loc !== currentLocale)
            .map(loc => ({
                '@type': 'WebPage',
                '@id': `${host}/${loc}#website`,
                url: `${host}/${loc}`,
                inLanguage: loc,
            }));
        
        const graph = [
          {
            "@type": "WebSite",
            "@id": `${host}/#website`,
            identifier: `${host}/`,
            name: siteName,
            description: `${siteName} `,
            url: `${host}/`,
            inLanguage: currentLocale,
            image: siteStore.getLogoUri,
            cssSelector: "body",
            xpath: "/html/body",
            ...(workTranslation.length > 0 ? { workTranslation } : {}),
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${host}/${currentLocale}/search?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
            publisher: {
              "@id": "https://www.cbd.int/#identity",
            },
          },
          {
            "@type": "Organization",
            "@id": "https://www.cbd.int/#identity",
            identifier: "https://www.cbd.int/",
            name: "Secretary of the Convention on Biological Diversity",
            url: "https://www.cbd.int/",
            logo: "https://www.cbd.int/themes/custom/bootstrap_sass/images/CBD_logo_green.png",
          },
          {
            "@type": "WebPage",
            "@id": `${host}/${currentLocale}#webpage`,
            name: siteName,
            url: `${host}/${currentLocale}`,
            inLanguage: currentLocale,
            cssSelector: "main",
            xpath: "//main",
            image: siteStore.getLogoUri,
            isPartOf: {
              "@id": `${host}/#website`,
            },
            about: {
              "@id": "https://www.cbd.int/#identity",
            },
          },
        ];
        
        if (headerSchema) {
            if (mainMenuSchema) {
                headerSchema.hasPart = { '@id': mainMenuSchema['@id'] };
            }
            graph.push(headerSchema);
        }
        
        if (mainMenuSchema) {
            graph.push(mainMenuSchema);
        }
        
        if (footerSchema) {
            graph.push(footerSchema);
        }
        
        const schema = {
            '@context': 'https://schema.org',
            '@graph': graph,
        };
        
        return {
            script: [
                {
                    type: 'application/ld+json',
                    innerHTML: JSON.stringify(schema),
                },
            ],
        };
    });
}

// ============================================================================
// SEARCH PAGE SCHEMA
// ============================================================================

/**
 * Composable for search page schema
 * Supports all locales and includes search results with appropriate mainEntity types
 */
export function useSearchPageSchemaOrg() {
    const siteStore = useSiteStore();
    const pageStore = usePageStore();
    const { locale } = useI18n();
    const route = useRoute(); // Move outside useHead callback
    const { getBreadcrumbSchemaSync } = useBreadcrumbsSchemaOrg();
    const { getHeaderSchemaSync } = useHeaderSchemaOrg();
    const { getFooterSchemaSync } = useFooterSchemaOrg();
    const { getMainMenuSchemaSync } = useMainMenuSchemaOrg();
    
    useHead(() => {
        const host = siteStore.host;
        const currentLocale = unref(locale);
        const page = pageStore.page;
        
        if (!host || !page) return {};
        
        // Get dynamic path from pageStore (handles all locales)
        const searchPath = page?.path?.alias || '/search';
        const searchUrl = `${host}/${currentLocale}${searchPath}`;
        const pageName = page?.name || 'Search';
        
        // Get query parameters for richer schema
        const searchQuery = route?.query?.q || route?.query?.freeText || '';
        const totalResults = pageStore?.searchResults?.count || 0;
        
        const breadcrumbSchema = getBreadcrumbSchemaSync();
        const headerSchema = getHeaderSchemaSync();
        const footerSchema = getFooterSchemaSync();
        const mainMenuSchema = getMainMenuSchemaSync();
        
        const graph = [
            {
                '@type': 'WebSite',
                '@id': `${host}/#website`,
                identifier: `${host}/`,
                name: siteStore.name + ' National Clearing-House, Convention on Biological Diversity',
                url: `${host}/`,
                inLanguage: currentLocale,
                cssSelector: 'body',
                xpath: '/html/body',
                potentialAction: {
                    '@type': 'SearchAction',
                    target: {
                        '@type': 'EntryPoint',
                        urlTemplate: `${searchUrl}?q={search_term_string}`,
                    },
                    'query-input': 'required name=search_term_string',
                },
            },
            {
                '@type': 'SearchResultsPage',
                '@id': `${searchUrl}#webpage`,
                name: pageName,
                url: searchUrl,
                inLanguage: currentLocale,
                isPartOf: { '@id': `${host}/#website` },
                cssSelector: '#page-list-container',
                xpath: '//*[@id="page-list-container"]',
                ...(searchQuery ? { about: searchQuery } : {}),
                ...(totalResults > 0 ? { numberOfItems: totalResults } : {}),
                ...(page?.changed ? { dateModified: page.changed } : {}),
            },
        ];
        
        // Add breadcrumb schema
        if (breadcrumbSchema) {
            graph.push(breadcrumbSchema);
        }
        
        // Add header, menu, and footer schemas
        if (headerSchema) {
            if (mainMenuSchema) {
                headerSchema.hasPart = { '@id': mainMenuSchema['@id'] };
            }
            graph.push(headerSchema);
        }
        
        if (mainMenuSchema) {
            graph.push(mainMenuSchema);
        }
        
        if (footerSchema) {
            graph.push(footerSchema);
        }
        
        // Add search results as hasPart
        const results = pageStore?.searchResults?.data || [];
        if (results.length > 0) {
            const hasPart = [];
            
            results.forEach((result, index) => {
                const resultUrl = result?.path?.alias 
                    ? `${host}/${currentLocale}${result.path.alias}`
                    : `${searchUrl}#result-${index}`;
                
                // Determine mainEntity type based on content type
                const typeId = result?.drupalInternalTid || result?.type;
                const mainEntityType = getMainEntityTypeForContent(typeId);
                
                const resultSchema = {
                    '@type': 'WebPage',
                    '@id': `${resultUrl}#searchresult`,
                    name: result?.title || result?.name,
                    url: resultUrl,
                    inLanguage: currentLocale,
                    cssSelector: `#page-list-data-body > div:nth-child(${index + 1})`,
                    xpath: `//*[@id="page-list-data-body"]/div[${index + 1}]`,
                    position: index + 1,
                };
                
                // Add mainEntity with specific type
                if (mainEntityType && result?.title) {
                    resultSchema.mainEntity = {
                        '@type': mainEntityType,
                        name: result.title || result.name,
                        ...(result?.fieldPublished || result?.created ? { datePublished: result.fieldPublished || result.created } : {}),
                        ...(result?.changed ? { dateModified: result.changed } : {}),
                        ...(result?.body?.value ? { description: stripHtml(result.body.value).substring(0, 200) } : {}),
                    };
                }
                
                hasPart.push({ '@id': resultSchema['@id'] });
                graph.push(resultSchema);
            });
            
            // Add hasPart to SearchResultsPage
            const searchPageIndex = graph.findIndex(item => item['@type'] === 'SearchResultsPage');
            if (searchPageIndex !== -1 && hasPart.length > 0) {
                graph[searchPageIndex].hasPart = hasPart;
            }
        }
        
        const schema = {
            '@context': 'https://schema.org',
            '@graph': graph,
        };
        
        return {
            script: [
                {
                    type: 'application/ld+json',
                    innerHTML: JSON.stringify(schema),
                },
            ],
        };
    });
}

/**
 * Map content type IDs to appropriate Schema.org mainEntity types
 * @param {number} typeId - Drupal content type ID
 * @returns {string|null} Schema.org type name
 */
function getMainEntityTypeForContent(typeId) {
    const typeMap = {
        [contentTypeTidConstants.NEWS]: 'NewsArticle',
        [contentTypeTidConstants.ARTICLE]: 'Article',
        [contentTypeTidConstants.EVENT]: 'Event',
        [contentTypeTidConstants.LEARNING_RESOURCE]: 'LearningResource',
        [contentTypeTidConstants.PROJECT]: 'Project',
        [contentTypeTidConstants.GOVERNMENT_MINISTRY]: 'GovernmentOrganization',
        [contentTypeTidConstants.PROTECTED_AREA]: 'Place',
        [contentTypeTidConstants.ECOSYSTEM]: 'Place',
        [contentTypeTidConstants.BIODIVERSITY_DATA]: 'Dataset',
        [contentTypeTidConstants.DOCUMENT]: 'DigitalDocument',
        [contentTypeTidConstants.IMAGE_OR_VIDEO]: 'MediaObject',
        [contentTypeTidConstants.FAQ]: 'Question',
        [contentTypeTidConstants.CONTACT]: 'ContactPoint',
        [contentTypeTidConstants.ANNOUNCEMENT]: 'Article',
    };
    
    return typeMap[typeId] || 'Thing';
}
