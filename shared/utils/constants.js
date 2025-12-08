// import { kebabCase } from 'change-case';
/**
 * An array of objects representing the different content types in the system.
 *
 * @type {Array<Object>}
 * @property {number} drupalInternalTid - The internal Drupal Term ID (tid).
 * @property {string} name - The singular name of the content type.
 * @property {string} field_plural - The plural name of the content type.
 */

export const contentTypes = [
    { drupalInternalTid: 2, name: 'News', field_plural: 'News', icon: '📰' },
    { drupalInternalTid: 3, name: 'Meeting or Event', field_plural: 'Meetings & Events', icon: '📅' },
    { drupalInternalTid: 4, name: 'Learning Resource', field_plural: 'Learning Resources', icon: '🎓' },
    { drupalInternalTid: 5, name: 'Project', field_plural: 'Projects', icon: '📊' },
    { drupalInternalTid: 6, name: 'Article', field_plural: 'Articles', icon: '📄' },
    { drupalInternalTid: 8, name: 'Government Ministry or Institute', field_plural: 'Government Ministries or Institutes', icon: '🏛️' },
    { drupalInternalTid: 9, name: 'Ecosystem', field_plural: 'Ecosystems', icon: '🌍' },
    { drupalInternalTid: 10, name: 'Protected Area', field_plural: 'Protected Areas', icon: '🏞️' },
    { drupalInternalTid: 11, name: 'Biodiversity Data', field_plural: 'Biodiversity Data', icon: '📈' },
    { drupalInternalTid: 12, name: 'Document', field_plural: 'Documents', icon: '📋' },
    { drupalInternalTid: 13, name: 'Related Website', field_plural: 'Related Websites', icon: '🔗' },
    { drupalInternalTid: 15, name: 'Other Resource', field_plural: 'Others Resources', icon: '⚙️' },
    { drupalInternalTid: 16, name: 'Image or Video', field_plural: 'Images or Videos', icon: '🎬' },
    { drupalInternalTid: 43, name: 'FAQ', field_plural: 'FAQs', icon: '❓' },
    { drupalInternalTid: 44, name: 'National Information', field_plural: 'National Informations', icon: '🏴' },
    { drupalInternalTid: 45, name: 'Status of LMO', field_plural: 'Status of LMOs', icon: '🧬' },
    { drupalInternalTid: 46, name: 'Field Trial', field_plural: 'Field Trials', icon: '🌱' },
    { drupalInternalTid: 47, name: 'National Mainstreaming Strategy', field_plural: 'National Mainstreaming Strategies', icon: '🗂️' },
    { drupalInternalTid: 48, name: 'Capacity Building', field_plural: 'Capacity Building', icon: '🔧' },
    { drupalInternalTid: 49, name: 'Announcement', field_plural: 'Announcements', icon: '📢' },
    { drupalInternalTid: 50, name: 'Contact', field_plural: 'Contacts', icon: '📞' }
];

export const typeMapIds = createContentTypeMapping(contentTypes);
export const contentTypeIcons = {
    2: '📰',   // News
    3: '📅',   // Meeting or Event
    4: '🎓',   // Learning Resource
    5: '📊',   // Project
    6: '📄',   // Article
    8: '🏛️',   // Government Ministry or Institute
    9: '🌍',   // Ecosystem
    10: '🏞️',  // Protected Area
    11: '📈',  // Biodiversity Data
    12: '📋',  // Document
    13: '🔗',  // Related Website
    15: '⚙️',  // Other Resource
    16: '🎬',  // Image or Video
    43: '❓',  // FAQ
    44: '🏴',  // National Information
    45: '🧬',  // Status of LMOs
    46: '🌱',  // Field Trial
    47: '🗂️',  // National Mainstreaming Strategy
    48: '🔧',  // Capacity-Building
    49: '📢',     // Announcement
    50: '📞'   // Contact
};

/**
 * An object containing constants for content type Drupal internal Term IDs (tids).
 * These are generated from the contentTypes array for easy access.
 * Keys are the constant-cased version of the content type name and its plural form.
 *
 * @type {Object<string, number>}
 */
export const contentTypeTidConstants = {
  ANNOUNCEMENT: 49,
  ANNOUNCEMENTS: 49,
  ARTICLE: 6,
  ARTICLES: 6,
  BASIC_PAGE: 6,
  BASIC_PAGES: 6,
  CAPACITY_BUILDING: 48,
  BIODIVERSITY_DATA: 11,
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
  GOVERNMENT_MINISTRIES_OR_INSTITUTES: 8,
  GOVERNMENT_MINISTRY_OR_INSTITUTE: 8,
  IMAGE_OR_VIDEO: 16,
  IMAGES_OR_VIDEOS: 16,
  LEARNING_RESOURCE: 4,
  LEARNING_RESOURCES: 4,
  MEETING_OR_EVENT: 3,
  MEETINGS_AND_EVENTS: 3,
  MEETINGS_EVENTS: 3,
  NATIONAL_INDICATOR: 48,
  NATIONAL_INDICATORS: 48,
  NATIONAL_INFORMATION: 44,
  NATIONAL_INFORMATIONS: 44,
  NATIONAL_MAINSTREAMING_STRATEGIES: 47,
  NATIONAL_MAINSTREAMING_STRATEGY: 47,
  NEWS: 2,
  OTHER: 15,
  OTHER_CONTENT_TYPES: 15,
  OTHER_RESOURCE: 15,
  OTHER_RESOURCES: 15,
  OTHER_TYPES: 15,
  OTHERS: 15,
  PROJECT: 5,
  PROJECTS: 5,
  PROTECTED_AREA: 10,
  PROTECTED_AREAS: 10,
  RELATED_WEBSITE: 13,
  RELATED_WEBSITES: 13,
  STATUS_OF_LMOS: 45,
};

/**
 * An object mapping content type Drupal internal Term IDs (tids) to their singular names.
 * Generated from the contentTypes array.
 *
 * @type {Object<number, string>}
 */
export const contentTypeNameConstants = contentTypes.reduce((acc, { drupalInternalTid, name }) => {
    acc[drupalInternalTid] = name;
    return acc;
}, {});

/**
 * An object mapping content type Drupal internal Term IDs (tids) to their plural names.
 * Generated from the contentTypes array.
 *
 * @type {Object<number, string>}
 */
export const contentTypePluralConstants = contentTypes.reduce((acc, { drupalInternalTid, field_plural }) => {
    acc[drupalInternalTid] = field_plural;
    return acc;
}, {});

/**
 * An object containing constants for system page Drupal internal Term IDs (tids).
 * These are used to identify specific system pages.
 *
 * @type {Object<string, number>}
 */
export const systemPageTidConstants = {
    HOME: 20,
    SEARCH: 21,  
    SEARCH_SEC: 23,
    SEARCH_BCH:52,
    SEARCH_ABS:53,  
    NEWS: 22,
    NATIONAL_CONTACT_POINTS: 30,
    FORUMS: 24,
    CREDITS: 25,
    TERMS_OF_USE: 26,
    BL2_MIGRATION: 35,
    CHM_NETWORK:38,
    SITE_MAP_HTML: 39,
    SITE_MAP_XML: 40,
    NT7:31,
    DEV:42,
    ASSISTANCE: 41
}

/**
 * Logging level constants shared between server and client utilities.
 * Each level matches the Consola numeric level.
 */
export const LOG_LEVEL = {
    FATAL: 0,
    WARN: 1,
    LOG: 2,
    INFO: 3,
    DEBUG: 4,
    TRACE: 5,
};

/**
 * Maps logging levels to the Consola message types they should enable.
 * Used when deciding which named logger helpers can emit output.
 */
export const LOG_TYPES = {
    [LOG_LEVEL.FATAL]: ['fatal', 'error'],
    [LOG_LEVEL.WARN]: ['warn'],
    [LOG_LEVEL.LOG]: ['log'],
    [LOG_LEVEL.INFO]: ['info', 'success', 'fail', 'ready', 'start'],
    [LOG_LEVEL.DEBUG]: ['debug'],
    [LOG_LEVEL.TRACE]: ['trace'],
};

/**
 * Creates a mapping object from content type names to their Drupal internal Term IDs.
 * Uses kebab-case formatting for the keys.
 *
 * @param {Array<Object>} contentTypesArray - Array of content type objects
 * @returns {Object<string, number>} Object with kebab-case names as keys and drupalInternalTid as values
 */
function createContentTypeMapping(contentTypesArray) {
    // Simplified version without kebab-case dependency
    return contentTypesArray.reduce((acc, { name, drupalInternalTid }) => {
        // Convert to lowercase and replace spaces with hyphens
        const key = name.toLowerCase().replace(/\s+/g, '-');
        acc[key] = drupalInternalTid;
        return acc;
    }, {});
}
