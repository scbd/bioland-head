import { defineStore } from 'pinia';

// Static image maps - never mutated, used for deterministic selection
const imageMap = {
    news: [
        `/images/types/news/1.jpg`,
        `/images/types/news/2.jpg`,
        `/images/types/news/3.jpg`,
        `/images/types/news/4.jpg`,
        `/images/types/news/5.jpg`,
        `/images/types/news/6.jpg`,
        `/images/types/news/7.jpg`,
        `/images/types/news/8.jpg`
    ],
    notification: [
        `/images/types/notification/1.jpg`,
        `/images/types/notification/2.jpg`
    ],
    statement: [
        `/images/types/statement/1.jpg`
    ],
    meeting: [
        `/images/types/meeting/1.jpg`,
        `/images/types/meeting/2.jpg`,
        `/images/types/meeting/3.jpg`,
        `/images/types/meeting/4.jpg`,
        `/images/types/meeting/5.jpg`,
        `/images/types/meeting/6.jpg`,
        `/images/types/meeting/7.jpg`,
        `/images/types/meeting/8.jpg`
    ],
    pressRelease: [
        `/images/types/press-release/1.jpg`,
        `/images/types/press-release/2.jpg`
    ],
    events: [
        `/images/types/events/1.jpg`,
        `/images/types/events/2.jpg`
    ],
    other: [
        `/images/types/other/1.jpg`,
        `/images/types/other/2.jpg`,
        `/images/types/other/3.jpg`,
        `/images/types/other/4.jpg`,
        `/images/types/other/5.jpg`,
        `/images/types/other/6.jpg`,
        `/images/types/other/7.jpg`,
        `/images/types/other/8.jpg`,
        `/images/types/other/9.jpg`,
        `/images/types/other/10.jpg`,
        `/images/types/other/11.jpg`,
        `/images/types/other/12.jpg`,
        `/images/types/other/13.jpg`,
        `/images/types/other/14.jpg`,
        `/images/types/other/15.jpg`,
        `/images/types/other/16.jpg`,
        `/images/types/other/17.jpg`,
        `/images/types/other/18.jpg`,
        `/images/types/other/19.jpg`,
        `/images/types/other/20.jpg`,
        `/images/types/other/21.jpg`,
        `/images/types/other/22.jpg`
    ]
};

/**
 * Generate a deterministic hash from a string.
 * Same input always produces same output (SSR-safe).
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Get a unique identifier from the record for deterministic image selection.
 */
function getRecordIdentifier(ctx) {
    // Try various unique identifiers in order of preference
    return ctx?.dnid?.toString() 
        || ctx?.id?.toString()
        || ctx?.uuid
        || ctx?.href
        || ctx?.title
        || '';
}

export const useImageGenStore = defineStore('imageGenerator', { 
    state: () => ({}),
    actions: {
        getImage(ctx) {
            if (!ctx) return;

            const type = this.getTypePath(ctx);
        
            if (!imageMap[type]) {
                consola.warn('No images for type: ', type);
                return { src: '/images/no-image.png', alt: '', title: '' };
            }
        
            const src = this.getSrc(type, ctx);
            const alt = ctx?.title || ctx?.name || ctx?.fieldTitle || ctx?.fieldName || '';
        
            return { alt, src, title: alt };
        },

        /**
         * Get image source deterministically based on record identifier.
         * Same record always gets same image (SSR-safe).
         */
        getSrc(type, ctx) {
            const images = imageMap[type];
            
            if (!images?.length) {
                throw new Error(`No images for type: ${type}`);
            }
        
            // Use record identifier to deterministically select an image
            const identifier = getRecordIdentifier(ctx);
            const hash = hashString(identifier);
            const index = hash % images.length;
        
            return images[index];
        },

        getTypePath(ctx) {
            const { schema: s } = ctx || {};
            
            const schema = s || this.getTypeNameFromDrupalRecord(ctx);
            const exists = !!imageMap[schema];
        
            if (exists) return schema;
            
            return 'other';
        },

        getTypeNameFromDrupalRecord(ctx) {
            if (!ctx?.fieldTypePlacement?.drupalInternalTid) return undefined;
        
            const drupalTypes = ['', '', '', 'events'];
        
            return drupalTypes[ctx?.fieldTypePlacement?.drupalInternalTid];
        }
    }
});