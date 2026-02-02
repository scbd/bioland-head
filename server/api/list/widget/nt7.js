import clone from 'lodash.clonedeep';

// Seeded random function for consistent results within time windows
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

export default cachedEventHandler(async (event) => {
    try{
        const query            = getQuery   (event);
        const ctx              = await useRequestContext(event);

        const schemas = ['nationalTarget7'];
        const countries = ({ ...ctx, ...query }).countries;
        
        // Fetch with all fields (getAllBySchemas doesn't support field selection)
        // Field filtering happens at index query level in cbd-index.js
        const response = await getAllBySchemas({ ...ctx, ...query, countries, realms: ['ORT'] }, schemas, countries);



        // Return a random chunk of 20 items in sequence, wrapping around if needed
        // Use time-based seed that changes every 5 minutes for consistent results
        const chunkSize = 20;
        const totalItems = response.data?.length || 0;
        
        if (totalItems > chunkSize) {
            // Seed changes every 5 minutes (300,000 ms)
            const seed = Math.floor(Date.now() / 300000);
            const randomStart = Math.floor(seededRandom(seed) * totalItems);
            const chunk = [];
            
            for (let i = 0; i < chunkSize; i++) {
                const index = (randomStart + i) % totalItems;
                chunk.push(response.data[index]);
            }
            
            response.data = chunk;
            response.count = totalItems; // Keep original count
        }

        return response;
    }
    catch (e) {
        passError(event, e);
    }
}, {
    maxAge: 60 * 5, // 5 minutes cache
    getKey: async (event) => {
        const ctx = await useRequestContext(event).catch(() => ({ siteCode: 'unknown', locale: 'en', multiSiteCode: 'bl2', env: 'dev' }));
        const { siteCode, locale, multiSiteCode, env } = ctx;
        // Include 5-minute window in cache key to align with seeded random
        const timeWindow = Math.floor(Date.now() / 300000);
        return `${env}-${multiSiteCode}-${siteCode}-${locale}-nt7-${timeWindow}`;
    },
    base: 'lists',
    varies: ['host', 'x-forwarded-host']
})

