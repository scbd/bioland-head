/**
 * Schema.org Composable for Bioland Head
 * 
 * Provides structured data (JSON-LD) for all page types using nuxt-schema-org.
 * Maps content types to appropriate Schema.org types and generates rich snippets.
 * 
 * References:
 * - https://nuxtseo.com/docs/schema-org/getting-started/introduction
 * - https://schema.org/
 */

import { contentTypes, contentTypeTidConstants } from '#shared/utils/constants';

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

/**
 * Main Schema.org composable - sets up structured data for the current page
 * Call this from your page components to automatically generate JSON-LD
 */
export function usePageSchemaOrg() {
    const siteStore = useSiteStore();
    const pageStore = usePageStore();
    const { locale } = useI18n();
    
    // Define website and organization (base identity)
    useSchemaOrg([
        defineWebSite({
            name: () => siteStore.name || 'CBD Clearing-House',
            description: () => `${siteStore.name || 'National'} Clearing-House Mechanism`,
            inLanguage: () => locale.value,
        }),
        defineOrganization({
            name: () => siteStore.name || 'CBD Clearing-House',
            logo: () => siteStore.getLogoUri,
        }),
    ]);
    
    // Compute schema data reactively
    const schemaData = computed(() => {
        const page = pageStore.page;
        const currentLocale = unref(locale);
        const host = siteStore.host;
        const siteName = siteStore.name || 'CBD Clearing-House';
        
        if (!page || !Object.keys(page).length) {
            return null;
        }
        
        const typeId = pageStore.typeId;
        const schemaType = getSchemaType(typeId);
        const canonicalPath = page?.path?.alias ? `/${currentLocale}${page.path.alias}` : `/${currentLocale}`;
        const canonicalUrl = `${host}${canonicalPath}`;
        const imageUrl = getImageUrl(page, host);
        const videoUrls = getVideoUrls(page);
        
        return {
            page,
            currentLocale,
            host,
            siteName,
            typeId,
            schemaType,
            canonicalUrl,
            imageUrl,
            videoUrls,
            title: page?.title || page?.name,
            description: getPlainTextDescription(page),
            datePublished: page?.fieldPublished || page?.created,
            dateModified: page?.changed,
            typeName: page?.fieldTypePlacement?.name || getContentTypeName(typeId),
            startDate: page?.fieldStartDate,
            endDate: page?.fieldEndDate,
        };
    });
    
    // Watch for page data changes and update schema
    watch(schemaData, (data) => {
        if (!data) return;
        
        const baseProps = {
            name: data.title,
            description: data.description,
            url: data.canonicalUrl,
            inLanguage: data.currentLocale,
            datePublished: data.datePublished,
            dateModified: data.dateModified,
            image: data.imageUrl,
        };
        
        // Build breadcrumb items
        const breadcrumbItems = [
            { name: 'Home', item: `${data.host}/${data.currentLocale}` },
        ];
        
        if (data.typeName) {
            breadcrumbItems.push({ name: data.typeName });
        }
        
        if (data.title) {
            breadcrumbItems.push({ 
                name: data.title, 
                item: data.canonicalUrl 
            });
        }
        
        // Add breadcrumb
        useSchemaOrg([
            defineBreadcrumb({
                itemListElement: breadcrumbItems,
            }),
        ]);
        
        // Type-specific schema
        switch (data.schemaType) {
            case 'NewsArticle':
            case 'Article':
                useSchemaOrg([
                    defineArticle({
                        '@type': data.schemaType,
                        ...baseProps,
                        headline: data.title,
                        articleSection: data.typeName,
                    }),
                ]);
                break;
                
            case 'Event':
                useSchemaOrg([
                    defineEvent({
                        ...baseProps,
                        startDate: data.startDate,
                        endDate: data.endDate,
                        eventStatus: 'https://schema.org/EventScheduled',
                    }),
                ]);
                break;
                
            case 'LearningResource':
            case 'Course':
                useSchemaOrg([
                    defineCourse({
                        ...baseProps,
                    }),
                ]);
                break;
                
            case 'GovernmentOrganization':
                useSchemaOrg([
                    defineOrganization({
                        '@type': 'GovernmentOrganization',
                        ...baseProps,
                    }),
                ]);
                break;
                
            case 'Place':
                useSchemaOrg([
                    definePlace({
                        ...baseProps,
                        geo: data.page?.fieldGeo ? {
                            '@type': 'GeoCoordinates',
                            latitude: data.page.fieldGeo.lat,
                            longitude: data.page.fieldGeo.lon,
                        } : undefined,
                    }),
                ]);
                break;
                
            case 'MediaObject':
                if (data.videoUrls.length) {
                    useSchemaOrg([
                        defineVideo({
                            ...baseProps,
                            embedUrl: data.videoUrls[0],
                        }),
                    ]);
                } else if (data.imageUrl) {
                    useSchemaOrg([
                        defineImage({
                            ...baseProps,
                            url: data.imageUrl,
                        }),
                    ]);
                } else {
                    useSchemaOrg([defineWebPage(baseProps)]);
                }
                break;
                
            case 'FAQPage':
                useSchemaOrg([
                    defineWebPage({
                        '@type': 'FAQPage',
                        ...baseProps,
                    }),
                ]);
                break;
                
            case 'ContactPoint':
                useSchemaOrg([
                    defineOrganization({
                        name: data.siteName,
                        contactPoint: {
                            '@type': 'ContactPoint',
                            name: data.title,
                            email: data.page?.fieldEmail,
                            telephone: data.page?.fieldPhone,
                            contactType: 'customer service',
                        },
                    }),
                ]);
                break;
                
            default:
                // Default to WebPage
                useSchemaOrg([
                    defineWebPage(baseProps),
                ]);
        }
        
        // Add video schemas for attachments
        data.videoUrls.forEach((embedUrl, index) => {
            if (index > 0) { // First video already handled above for MediaObject type
                useSchemaOrg([
                    defineVideo({
                        name: data.title,
                        embedUrl,
                    }),
                ]);
            }
        });
    }, { immediate: true });
}

/**
 * Composable for home page schema
 * Adds WebSite schema with search action
 */
export function useHomePageSchemaOrg() {
    const siteStore = useSiteStore();
    const { locale } = useI18n();
    
    useSchemaOrg([
        defineWebSite({
            name: () => siteStore.name || 'CBD Clearing-House',
            description: () => `${siteStore.name || 'National'} Clearing-House Mechanism`,
            inLanguage: () => locale.value,
            potentialAction: defineSearchAction({
                target: `${siteStore.host}/${locale.value}/search?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
            }),
        }),
        defineOrganization({
            name: () => siteStore.name || 'CBD Clearing-House',
            logo: () => siteStore.getLogoUri,
        }),
        defineWebPage({
            name: () => siteStore.name || 'Home',
            inLanguage: () => locale.value,
        }),
    ]);
}

/**
 * Composable for search page schema
 */
export function useSearchPageSchemaOrg() {
    const siteStore = useSiteStore();
    const { locale } = useI18n();
    
    useSchemaOrg([
        defineWebPage({
            '@type': 'SearchResultsPage',
            name: 'Search Results',
            inLanguage: () => locale.value,
        }),
    ]);
}
