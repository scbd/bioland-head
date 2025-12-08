/**
 * SEO Composable for Bioland Head
 * 
 * Handles:
 * - Page title and description
 * - HTML lang and dir attributes (RTL/LTR)
 * - Canonical URLs (self-canonicalize per language)
 * - Hreflang alternate links for all available languages
 * - x-default hreflang pointing to default locale
 * - Open Graph and Twitter meta tags
 * - Node/media ID paths listed as alternates pointing to canonical alias
 */

import { stripHtml } from 'string-strip-html';
import { isRtl }     from '#shared/utils/rtl-languages';

/**
 * Get text direction for a locale using shared RTL languages utility
 * @param {string} localeCode - The locale code
 * @returns {'rtl' | 'ltr'} - The text direction
 */
export function getTextDirection(localeCode) {
    return isRtl(localeCode) ? 'rtl' : 'ltr';
}

/**
 * Get meta description from page data
 * Checks for summary first, then strips HTML from body/description and truncates
 * @param {Object} page - Page data from pageStore
 * @param {number} maxLength - Maximum length for description
 * @returns {string} - Clean description text
 */
function getMetaDescription(page, maxLength = 160) {
    // Check for pre-existing summary first (already processed by Drupal)
    const summary = page?.body?.summary || page?.description?.summary;
    if (summary) {
        const { trunc } = useText();
        return trunc(summary, maxLength);
    }
    
    // Fallback to stripping HTML from body/description value
    const html = page?.body?.value || page?.body?.processed || 
                 page?.description?.value || page?.description?.processed || '';
    
    if (!html) return '';
    
    const { trunc } = useText();
    const plainText = stripHtml(html).result.replace(/\s+/g, ' ').trim();
    
    return trunc(plainText, maxLength);
}

/**
 * Get the canonical path (alias) for a page
 * Note: aliases from the API already include the locale prefix (e.g., "/en/page-path")
 * 
 * @param {Object} page - Page data from pageStore
 * @param {string} locale - Current locale
 * @returns {string} - The canonical path with locale prefix
 */
function getCanonicalPath(page, locale) {
    // If we have aliases, use the localized alias (already includes locale prefix)
    if (page?.aliases?.[locale]) {
        return page.aliases[locale];
    }
    
    // Fallback to path alias (need to add locale prefix)
    if (page?.path?.alias) {
        return `/${locale}${page.path.alias}`;
    }
    
    // For nodes, fallback to /locale/node/id path
    if (page?.drupalInternalNid) {
        return `/${locale}/node/${page.drupalInternalNid}`;
    }
    
    // For media, fallback to /locale/media/id path
    if (page?.drupalInternalMid) {
        return `/${locale}/media/${page.drupalInternalMid}`;
    }
    
    // For taxonomy terms, fallback to /locale/taxonomy/term/id path
    if (page?.drupalInternalTid) {
        return `/${locale}/taxonomy/term/${page.drupalInternalTid}`;
    }
    
    // Home page fallback
    return `/${locale}`;
}

/**
 * Get the ID-based path for a page (node/media/taxonomy)
 * Used to create alternate links from ID paths to canonical alias
 * 
 * @param {Object} page - Page data from pageStore
 * @param {string} locale - Locale code
 * @returns {string|null} - The ID-based path or null if not applicable
 */
function getIdBasedPath(page, locale) {
    if (page?.drupalInternalNid) {
        return `/${locale}/node/${page.drupalInternalNid}`;
    }
    if (page?.drupalInternalMid) {
        return `/${locale}/media/${page.drupalInternalMid}`;
    }
    if (page?.drupalInternalTid && page?.type?.startsWith('taxonomy_term--')) {
        return `/${locale}/taxonomy/term/${page.drupalInternalTid}`;
    }
    return null;
}

/**
 * Build hreflang link objects for alternate languages (excluding current locale)
 * The current locale is already self-referenced via the canonical link
 * 
 * @param {Object} page - Page data with aliases
 * @param {string} host - Base host URL (without locale)
 * @param {string} currentLocale - Current locale to exclude from alternates
 * @param {string} defaultLocale - Default locale for x-default
 * @param {string[]} availableLocales - List of available locale codes
 * @returns {Array} - Array of link objects for useHead
 */
function buildHreflangLinks(page, host, currentLocale, defaultLocale, availableLocales) {
    const links = [];
    
    if (!availableLocales?.length) return links;
    
    // Track which locales have been added to avoid duplicates
    const addedLocales = new Set();
    
    // Add hreflang for each available language EXCEPT current locale
    // (current locale is already self-canonicalized via rel="canonical")
    for (const locale of availableLocales) {
        if (locale === currentLocale) continue; // Skip current locale
        
        // Get the canonical path for this locale (alias already includes locale prefix)
        const canonicalPath = getCanonicalPath(page, locale);
        
        if (canonicalPath && !addedLocales.has(locale)) {
            links.push({
                rel: 'alternate',
                hreflang: locale,
                href: `${host}${canonicalPath}`
            });
            addedLocales.add(locale);
        }
    }
    
    // Add x-default pointing to the default locale (source of translations)
    // Only add if default locale is different from current (otherwise canonical covers it)
    if (defaultLocale !== currentLocale) {
        const defaultPath = getCanonicalPath(page, defaultLocale);
        if (defaultPath) {
            links.push({
                rel: 'alternate',
                hreflang: 'x-default',
                href: `${host}${defaultPath}`
            });
        }
    }
    
    return links;
}

/**
 * Build og:locale:alternate meta values for Facebook
 * @param {string[]} availableLocales - All available locales
 * @param {string} currentLocale - Current locale to exclude
 * @returns {string[]} - Array of alternate locale codes
 */
function buildOgLocaleAlternates(availableLocales, currentLocale) {
    if (!availableLocales?.length) return [];
    
    return availableLocales.filter(locale => locale !== currentLocale);
}

/**
 * Generate Twitter handle based on site name and type
 * Format: @{SITENAME}_National_Clearing_House (CHM sites)
 *         @{SITENAME}_National_Biosafety_Clearing_House (BCH sites)
 * 
 * @param {string} siteName - The site name
 * @param {boolean} isBiosafetySite - Whether this is a biosafety site
 * @returns {string} - Twitter handle (e.g., @BELGIUM_National_Clearing_House)
 */
function generateTwitterHandle(siteName, isBiosafetySite) {
    if (!siteName) return '';
    
    // Convert site name to uppercase and remove spaces
    const cleanName = siteName.replace(/\s+/g, '').toUpperCase();
    
    // Generate handle based on site type
    if (isBiosafetySite) {
        return `@${cleanName}_National_Biosafety_Clearing_House`;
    }
    
    return `@${cleanName}_National_Clearing_House`;
}

/**
 * Get the first image from page attachments for OG image
 * @param {Object} page - Page data
 * @param {string} host - Base host URL
 * @returns {Object|null} - Image object with src, alt, width, height
 */
function getOgImage(page, host) {
    const attachments = page?.fieldAttachments;
    
    if (!Array.isArray(attachments) || !attachments.length) return null;
    
    // Prefer hero images, then regular images
    const heroImage = attachments.find(({ type }) => type === 'media--hero');
    const regularImage = attachments.find(({ type }) => type === 'media--image');
    
    const image = heroImage || regularImage;
    
    if (!image?.fieldMediaImage?.uri?.url) return null;
    
    const src = `${host}${image.fieldMediaImage.uri.url}`;
    
    return {
        src,
        secureUrl: src, // For og:image:secure_url
        alt: image.fieldMediaImage?.meta?.alt || image.name || '',
        width: image.fieldWidth || image.fieldMediaImage?.meta?.width,
        height: image.fieldHeight || image.fieldMediaImage?.meta?.height,
        type: image.fieldMime || 'image/jpeg'
    };
}

/**
 * Main SEO composable for pages
 * Sets up useHead and useSeoMeta with all necessary SEO tags
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.isHomePage - Whether this is the home page
 */
export function usePageSeo(options = {}) {
    const { isHomePage = false } = options;
    
    const siteStore = useSiteStore();
    const pageStore = usePageStore();
    const { locale } = useI18n();
    
    // Compute all SEO data reactively
    const seoData = computed(() => {
        const currentLocale = unref(locale);
        const page = pageStore.page;
        const host = siteStore.host; // Host without locale
        const defaultLocale = siteStore.defaultLocale || 'en';
        const allLocales = siteStore.allLocales || [];
        const siteName = siteStore.name || '';
        const isBiosafetySite = siteStore.isBiosafetySite || false;
        
        // Title - page title for content, site name for home
        const title = isHomePage 
            ? (siteName || page?.name || 'Home')
            : (page?.title || page?.name || page?.label || '');
        
        // Full title always uses template: ${pageTitle} | ${siteName}
        const fullTitle = title && siteName ? `${title} | ${siteName}` : (title || siteName);
        
        // Description - check for summary first, then strip HTML and truncate
        const description = getMetaDescription(page, 160);
        
        // Canonical URL - self-canonicalize to the alias path
        const canonicalPath = getCanonicalPath(page, currentLocale);
        const canonicalUrl = `${host}${canonicalPath}`;
        
        // ID-based path (for alternate link if different from canonical)
        const idPath = getIdBasedPath(page, currentLocale);
        const hasIdPath = idPath && idPath !== canonicalPath;
        const idUrl = hasIdPath ? `${host}${idPath}` : null;
        
        // Hreflang alternate links (excludes current locale - that's covered by canonical)
        const hreflangLinks = buildHreflangLinks(page, host, currentLocale, defaultLocale, allLocales);
        
        // OG locale alternates
        const ogLocaleAlternates = buildOgLocaleAlternates(allLocales, currentLocale);
        
        // Text direction from i18n config
        const dir = getTextDirection(currentLocale);
        
        // OG Image
        const ogImage = getOgImage(page, host);
        
        // Type name for article type
        const typeName = page?.fieldTypePlacement?.name || '';
        
        // Published/Modified dates
        const publishedTime = page?.fieldPublished || page?.created;
        const modifiedTime = page?.changed;
        
        // Twitter handle based on site type
        const twitterHandle = generateTwitterHandle(siteName, isBiosafetySite);
        
        return {
            title,
            fullTitle,
            description,
            canonicalUrl,
            canonicalPath,
            idPath,
            idUrl,
            hasIdPath,
            hreflangLinks,
            ogLocaleAlternates,
            dir,
            currentLocale,
            siteName,
            ogImage,
            typeName,
            publishedTime,
            modifiedTime,
            host,
            defaultLocale,
            twitterHandle
        };
    });
    
    // Apply useHead for basic head management
    useHead(() => {
        const data = seoData.value;
        
        const links = [
            // Canonical link - self-canonicalize
            {
                rel: 'canonical',
                href: data.canonicalUrl
            },
            // Hreflang alternates for other locales (excludes current - covered by canonical)
            ...data.hreflangLinks
        ];
        
        // Add ID-based alternate link if exists (e.g., /node/123 -> canonical alias)
        // This tells search engines that the ID path is an alternate that should use canonical
        if (data.hasIdPath && data.idUrl) {
            links.push({
                rel: 'alternate',
                href: data.idUrl
            });
        }
        
        return {
            title: data.fullTitle,
            htmlAttrs: {
                lang: data.currentLocale,
                dir: data.dir
            },
            link: links
        };
    });
    
    // Apply useSeoMeta for comprehensive SEO meta tags
    useSeoMeta({
        // Basic meta
        title: () => seoData.value.fullTitle,
        description: () => seoData.value.description,
        
        // Open Graph
        ogTitle: () => seoData.value.title,
        ogDescription: () => seoData.value.description,
        ogUrl: () => seoData.value.canonicalUrl,
        ogSiteName: () => seoData.value.siteName,
        ogType: () => seoData.value.typeName ? 'article' : 'website',
        ogLocale: () => seoData.value.currentLocale,
        ogImage: () => seoData.value.ogImage?.src,
        ogImageSecureUrl: () => seoData.value.ogImage?.secureUrl,
        ogImageAlt: () => seoData.value.ogImage?.alt,
        ogImageWidth: () => seoData.value.ogImage?.width,
        ogImageHeight: () => seoData.value.ogImage?.height,
        ogImageType: () => seoData.value.ogImage?.type,
        
        // Article specific (if it's content)
        articlePublishedTime: () => seoData.value.publishedTime,
        articleModifiedTime: () => seoData.value.modifiedTime,
        articleSection: () => seoData.value.typeName,
        
        // Twitter Card
        twitterCard: () => seoData.value.ogImage?.src ? 'summary_large_image' : 'summary',
        twitterSite: () => seoData.value.twitterHandle,
        twitterTitle: () => seoData.value.title,
        twitterDescription: () => seoData.value.description,
        twitterImage: () => seoData.value.ogImage?.src,
        twitterImageAlt: () => seoData.value.ogImage?.alt,
        
        // Robots
        robots: 'index, follow'
    });
    
    // Add og:locale:alternate meta tags using useHead
    // useSeoMeta doesn't support arrays for og:locale:alternate
    useHead(() => {
        const data = seoData.value;
        
        if (!data.ogLocaleAlternates?.length) return {};
        
        return {
            meta: data.ogLocaleAlternates.map(locale => ({
                property: 'og:locale:alternate',
                content: locale
            }))
        };
    });
    
    return {
        seoData
    };
}

/**
 * Composable specifically for home page SEO
 * Uses site name as primary title
 */
export function useHomePageSeo() {
    return usePageSeo({ isHomePage: true });
}

/**
 * Composable for dynamic page SEO
 * Uses page title from pageStore
 */
export function useDynamicPageSeo() {
    return usePageSeo({ isHomePage: false });
}
