/**
 * @fileoverview Shared constants for the Bioland Head multi-site headless Drupal + Nuxt.js system.
 * 
 * This module provides centralized constants used across both client and server environments, including:
 * - Content type definitions and mappings (Drupal Term IDs to content types)
 * - System page identifiers for special pages (home, search, forums, etc.)
 * - Logging level configurations compatible with Consola
 * - Helper functions for content type lookups
 * 
 * **Purpose:**
 * - Ensures consistent content type identification across the entire application
 * - Provides multiple access patterns (by name, by ID, by plural form) for flexibility
 * - Centralizes logging configuration for both server (Nitro) and client environments
 * - Eliminates magic numbers by providing named constants for all Drupal Term IDs
 * 
 * **Usage Context:**
 * All constants are exported and can be imported by both server routes and client composables.
 * The contentTypes array serves as the single source of truth, with derived objects created
 * from it to support different lookup patterns.
 * 
 * @module shared/utils/constants
 */

/**
 * Content type definition with Drupal Term ID, names, and display icon.
 */
interface ContentType {
  /** The internal Drupal Term ID (tid) for this content type */
  drupalInternalTid: number;
  /** The singular display name of the content type */
  name: string;
  /** The plural display name of the content type */
  field_plural: string;
  /** Emoji icon representing this content type in UI */
  icon: string;
}

/**
 * Master array of all content types used in the Bioland Head system.
 * 
 * This is the **single source of truth** for content type definitions. All other
 * content type mappings (typeMapIds, contentTypeTidConstants, etc.) are derived
 * from this array.
 * 
 * Each content type corresponds to a Drupal taxonomy term and includes:
 * - The Drupal internal Term ID for lookups and API calls
 * - Singular and plural names for UI display
 * - An emoji icon for visual identification
 * 
 * These content types are used throughout the system for:
 * - Filtering and querying content from Drupal JSON:API
 * - Menu organization and navigation
 * - Search result categorization
 * - Content type badges and labels in cards/lists
 */
export const contentTypes: ContentType[] = [
    { drupalInternalTid: 2, name: 'News', field_plural: 'News', icon: '📰' },
    { drupalInternalTid: 3, name: 'Meeting or Event', field_plural: 'Meetings & Events', icon: '📅' },
    { drupalInternalTid: 4, name: 'Learning Resource', field_plural: 'Learning Resources', icon: '🎓' },
    { drupalInternalTid: 5, name: 'Project', field_plural: 'Projects', icon: '📊' },
    { drupalInternalTid: 6, name: 'Basic Page', field_plural: 'Basic Pages', icon: '📄' },
    { drupalInternalTid: 54, name: 'Article', field_plural: 'Articles', icon: '📄' },
    { drupalInternalTid: 8, name: 'Government Ministry or Institute', field_plural: 'Government Ministries or Institutes', icon: '🏛️' },
    { drupalInternalTid: 9, name: 'Ecosystem', field_plural: 'Ecosystems', icon: '🌍' },
    { drupalInternalTid: 10, name: 'Protected Area', field_plural: 'Protected Areas', icon: '🏞️' },
    { drupalInternalTid: 11, name: 'Biodiversity Data', field_plural: 'Biodiversity Data', icon: '📈' },
    { drupalInternalTid: 12, name: 'Document', field_plural: 'Documents', icon: '📋' },
    { drupalInternalTid: 13, name: 'Related Website', field_plural: 'Related Websites', icon: '🔗' },
    { drupalInternalTid: 15, name: 'Other', field_plural: 'Others', icon: '⚙️' },
    { drupalInternalTid: 16, name: 'Image or Video', field_plural: 'Images or Videos', icon: '🎬' },
    { drupalInternalTid: 55, name: 'Other Resource', field_plural: 'Other Resources', icon: '⚙️' },
    { drupalInternalTid: 43, name: 'FAQ', field_plural: 'FAQs', icon: '❓' },
    { drupalInternalTid: 44, name: 'National Information', field_plural: 'National Informations', icon: '🏴' },
    { drupalInternalTid: 45, name: 'Status of LMO', field_plural: 'Status of LMOs', icon: '🧬' },
    { drupalInternalTid: 46, name: 'Field Trial', field_plural: 'Field Trials', icon: '🌱' },
    { drupalInternalTid: 47, name: 'National Mainstreaming Strategy', field_plural: 'National Mainstreaming Strategies', icon: '🗂️' },
    { drupalInternalTid: 48, name: 'Capacity Building', field_plural: 'Capacity Building', icon: '🔧' },
    { drupalInternalTid: 49, name: 'Announcement', field_plural: 'Announcements', icon: '📢' },
    { drupalInternalTid: 50, name: 'Contact', field_plural: 'Contacts', icon: '📞' }
];

/**
 * Creates a kebab-case mapping from content type names to their Drupal Term IDs.
 * 
 * Converts content type names to lowercase and replaces spaces with hyphens,
 * creating URL-friendly identifiers. This helper function is used internally
 * to generate the typeMapIds export.
 * 
 * **Transformation examples:**
 * - "News" → "news"
 * - "Meeting or Event" → "meeting-or-event"
 * - "Government Ministry or Institute" → "government-ministry-or-institute"
 */
function createContentTypeMapping(contentTypesArray: ContentType[]): Record<string, number> {
    return contentTypesArray.reduce((acc, { name, drupalInternalTid }) => {
        // Convert to lowercase and replace spaces with hyphens
        const key = name.toLowerCase().replace(/\s+/g, '-');
        acc[key] = drupalInternalTid;
        return acc;
    }, {} as Record<string, number>);
}

/**
 * Mapping of content type names (kebab-case) to Drupal Term IDs.
 * 
 * Provides a convenient lookup for getting the Drupal Term ID when you have
 * a content type name in kebab-case format (e.g., "meeting-or-event" → 3).
 * 
 * Automatically generated from the contentTypes array using the
 * createContentTypeMapping helper function.
 * 
 * @example
 * typeMapIds['news'] // Returns: 2
 * typeMapIds['meeting-or-event'] // Returns: 3
 */
export const typeMapIds: Record<string, number> = createContentTypeMapping(contentTypes);

/**
 * Mapping of Drupal Term IDs to emoji icons for content types.
 * 
 * Used for displaying visual indicators in UI components like cards, badges,
 * and lists. The icons help users quickly identify content types at a glance.
 * 
 * **Note:** This is a static definition. Consider deriving from contentTypes array
 * in future refactoring to maintain single source of truth.
 * 
 * @example
 * contentTypeIcons[2] // Returns: '📰' (News)
 * contentTypeIcons[3] // Returns: '📅' (Meeting or Event)
 */
export const contentTypeIcons: Record<number, string> = {
    2: '📰',   // News
    3: '📅',   // Meeting or Event
    4: '🎓',   // Learning Resource
    5: '📊',   // Project
    6: '📄',   // Basic Page
    54: '📄',  // Article
    8: '🏛️',   // Government Ministry or Institute
    9: '🌍',   // Ecosystem
    10: '🏞️',  // Protected Area
    11: '📈',  // Biodiversity Data
    12: '📋',  // Document
    13: '🔗',  // Related Website
    15: '⚙️',  // Other
    16: '🎬',  // Image or Video
    55: '⚙️',  // Other Resource
    43: '❓',  // FAQ
    44: '🏴',  // National Information
    45: '🧬',  // Status of LMOs
    46: '🌱',  // Field Trial
    47: '🗂️',  // National Mainstreaming Strategy
    48: '🔧',  // Capacity-Building
    49: '📢',  // Announcement
    50: '📞'   // Contact
};

/**
 * Named constants for content type Drupal Term IDs.
 * 
 * Provides CONSTANT_CASE identifiers for all content types, supporting both
 * singular and plural variations for flexible usage patterns. This eliminates
 * magic numbers throughout the codebase.
 * 
 * Multiple aliases are provided for common variations:
 * - MEETING_OR_EVENT, MEETINGS_AND_EVENTS, MEETINGS_EVENTS (all → 3)
 * - EVENT, EVENTS (both → 3)
 * - NEWS (singular and plural both → 2)
 * 
 * **Usage:**
 * Use these constants instead of hardcoded numbers when:
 * - Filtering content by type in queries
 * - Checking page or content type in conditional logic
 * - Building navigation menus by type
 * 
 * @example
 * // Filtering content
 * const newsItems = items.filter(item => 
 *   item.type === contentTypeTidConstants.NEWS
 * );
 * 
 * @example
 * // Type-specific logic
 * switch(contentType) {
 *   case contentTypeTidConstants.MEETING_OR_EVENT:
 *     // Special event handling
 *     break;
 *   case contentTypeTidConstants.NEWS:
 *     // News-specific processing
 *     break;
 * }
 */
export const contentTypeTidConstants = {
  ANNOUNCEMENT: 49,
  ANNOUNCEMENTS: 49,
  ARTICLE: 54,
  ARTICLES: 54,
  BASIC_PAGE: 6,
  BASIC_PAGES: 6,
  BIODIVERSITY_DATA: 11,
  CAPACITY_BUILDING: 48,
  CONTACT: 50,
  CONTACTS: 50,
  DOCUMENT: 12,
  DOCUMENTS: 12,
  ECOSYSTEM: 9,
  ECOSYSTEMS: 9,
  EVENT: 3,
  EVENTS: 3,
  FAQ: 43,
  FAQS: 43,
  FIELD_TRIAL: 46,
  FIELD_TRIALS: 46,
  GOVERNMENT_MINISTRIES: 8,
  GOVERNMENT_MINISTRIES_OR_INSTITUTES: 8,
  GOVERNMENT_MINISTRY: 8,
  GOVERNMENT_MINISTRY_OR_INSTITUTE: 8,
  IMAGE_OR_VIDEO: 16,
  IMAGES_OR_VIDEOS: 16,
  LEARNING_RESOURCE: 4,
  LEARNING_RESOURCES: 4,
  MEETING: 3,
  MEETING_OR_EVENT: 3,
  MEETINGS: 3,
  MEETINGS_AND_EVENTS: 3,
  MEETINGS_EVENTS: 3,
  NATIONAL_INFORMATION: 44,
  NATIONAL_INFORMATIONS: 44,
  NATIONAL_MAINSTREAMING_STRATEGIES: 47,
  NATIONAL_MAINSTREAMING_STRATEGY: 47,
  NEWS: 2,
  OTHER: 15,
  OTHER_CONTENT_TYPES: 15,
  OTHER_RESOURCE: 55,
  OTHER_RESOURCES: 55,
  OTHER_TYPES: 15,
  OTHERS: 15,
  PROJECT: 5,
  PROJECTS: 5,
  PROTECTED_AREA: 10,
  PROTECTED_AREAS: 10,
  RELATED_WEBSITE: 13,
  RELATED_WEBSITES: 13,
  STATUS_OF_LMOS: 45,
} as const;

/**
 * Mapping of Drupal Term IDs to singular content type names.
 * 
 * Automatically generated from the contentTypes array. Use this for displaying
 * the singular name of a content type when you have its Term ID.
 * 
 * @example
 * contentTypeNameConstants[2] // Returns: 'News'
 * contentTypeNameConstants[3] // Returns: 'Meeting or Event'
 */
export const contentTypeNameConstants: Record<number, string> = contentTypes.reduce((acc, { drupalInternalTid, name }) => {
    acc[drupalInternalTid] = name;
    return acc;
}, {} as Record<number, string>);

/**
 * Mapping of Drupal Term IDs to plural content type names.
 * 
 * Automatically generated from the contentTypes array. Use this for displaying
 * the plural name of a content type when you have its Term ID.
 * 
 * Particularly useful for:
 * - List page headings (e.g., "All Articles", "Recent News")
 * - Navigation menu labels
 * - Search result group headers
 * 
 * @example
 * contentTypePluralConstants[2] // Returns: 'News'
 * contentTypePluralConstants[3] // Returns: 'Meetings & Events'
 * contentTypePluralConstants[54] // Returns: 'Articles'
 */
export const contentTypePluralConstants: Record<number, string> = contentTypes.reduce((acc, { drupalInternalTid, field_plural }) => {
    acc[drupalInternalTid] = field_plural;
    return acc;
}, {} as Record<number, string>);

/**
 * Named constants for system page Drupal Term IDs.
 * 
 * System pages are special pages in the Bioland Head application that have
 * specific functionality or reserved purposes (home page, search, forums, etc.).
 * These IDs correspond to Drupal taxonomy terms that identify these pages.
 * 
 * Unlike regular content pages, system pages often:
 * - Have special routing or rendering logic
 * - Bypass standard locale prefixing (e.g., /sites/)
 * - Trigger specific data fetching patterns
 * - Use dedicated components or layouts
 * 
 * @example
 * // Check if a page is the home page
 * if (pageTermId === systemPageTidConstants.HOME) { ... }
 * 
 * @example
 * // Different search implementations by type
 * switch(pageTermId) {
 *   case systemPageTidConstants.SEARCH: // Main search
 *   case systemPageTidConstants.SEARCH_BCH: // BCH-specific search
 *   case systemPageTidConstants.SEARCH_ABS: // ABS-specific search
 * }
 */
export const systemPageTidConstants = {
    HOME: 20,
    SEARCH: 21,  
    SEARCH_SEC: 23,
    SEARCH_BCH: 52,
    SEARCH_ABS: 53,  
    NEWS: 22,
    NATIONAL_CONTACT_POINTS: 30,
    FORUMS: 24,
    CREDITS: 25,
    TERMS_OF_USE: 26,
    BL2_MIGRATION: 35,
    CHM_NETWORK: 38,
    SITE_MAP_HTML: 39,
    SITE_MAP_XML: 40,
    NT7: 31,
    DEV: 42,
    ASSISTANCE: 41
} as const;

/**
 * Logging level constants compatible with Consola.
 * 
 * Defines numeric logging levels used by both server (Nitro) and client
 * environments. Each level is cumulative - setting a level enables that
 * level and all levels below it.
 * 
 * **Level Hierarchy (most severe → least severe):**
 * - FATAL (0): Critical errors causing application failure
 * - WARN (1): Warning messages about potential issues
 * - LOG (2): Standard log messages
 * - INFO (3): Informational messages, success, failures
 * - DEBUG (4): Debug information for development
 * - TRACE (5): Detailed trace information (most verbose)
 * 
 * **Configuration:**
 * - Server: Set via `NUXT_PUBLIC_LOG_LEVEL` environment variable or runtime config
 * - Client: Configured in client-side logger plugin
 * - Accepts string names (e.g., "DEBUG") or numeric values (e.g., 4)
 * 
 * @example
 * // In nuxt.config.ts or .env
 * NUXT_PUBLIC_LOG_LEVEL=DEBUG // Shows DEBUG, INFO, LOG, WARN, FATAL
 * 
 * @example
 * // Setting level programmatically
 * import { LOG_LEVEL } from '#shared/utils/constants';
 * configureLogger(LOG_LEVEL.DEBUG);
 * 
 * @see {@link configureLogger} in shared/utils/logger.ts
 */
export const LOG_LEVEL = {
    FATAL: 0,
    WARN: 1,
    LOG: 2,
    INFO: 3,
    DEBUG: 4,
    TRACE: 5,
} as const;

/**
 * Maps logging levels to their corresponding Consola message types.
 * 
 * This mapping determines which Consola methods are enabled at each logging level.
 * Used internally by the logger utility to decide whether a specific log message
 * should be output based on the current logging level.
 * 
 * **Level → Message Types:**
 * - FATAL (0): fatal, error
 * - WARN (1): warn
 * - LOG (2): log
 * - INFO (3): info, success, fail, ready, start
 * - DEBUG (4): debug
 * - TRACE (5): trace
 * 
 * When a level is set, all message types for that level AND all lower-numbered
 * levels are enabled. For example, setting LOG_LEVEL.INFO enables:
 * fatal, error, warn, log, info, success, fail, ready, start
 * 
 * @internal
 * @example
 * // With level set to INFO (3):
 * consola.error('error')   // Shown (FATAL level)
 * consola.warn('warning')  // Shown (WARN level)
 * consola.log('message')   // Shown (LOG level)
 * consola.info('info')     // Shown (INFO level)
 * consola.debug('debug')   // Hidden (DEBUG level not enabled)
 */
export const LOG_TYPES: Record<number, string[]> = {
    [LOG_LEVEL.FATAL]: ['fatal', 'error'],
    [LOG_LEVEL.WARN]: ['warn'],
    [LOG_LEVEL.LOG]: ['log'],
    [LOG_LEVEL.INFO]: ['info', 'success', 'fail', 'ready', 'start'],
    [LOG_LEVEL.DEBUG]: ['debug'],
    [LOG_LEVEL.TRACE]: ['trace'],
};
