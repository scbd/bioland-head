import { mergeQueryIntoContext } from '../../utils/merge-query-into-context';
import clone from 'lodash.clonedeep';

export default defineCachedEventHandler(
    async (event) => {
        try {
        const query = getQuery(event);
        const ctx = await useRequestContext(event);

        const promises = [];
        const schemas = ["nationalTarget7"];
        const merged = mergeQueryIntoContext(ctx, query);
        const allCountries = merged.countries;
        const countryMap = {};

        for (const country of Array.isArray(allCountries)
            ? allCountries
            : [allCountries]) {
            const countries = [country];

            promises.push(
            // BL-1135 D1: getAllBySchemas caches on multiSiteCode+siteCode+locale+schemas+countries
            // only (see server/utils/cbd-index.js). Passing `merged` here would leak client query
            // keys (freeText/filters/page) into the cached upstream body under a cache key that
            // ignores them, so a client-filtered result could be served to the next unfiltered
            // request. Build the argument from ctx only.
            getAllBySchemas(
                { ...ctx, countries },
                schemas,
                countries,
            ).then((response) => {
                const targets = limitArrayToX(
                shuffleArrayHourly(response.data),
                4,
                ).sort(sortNT7byToc);

                if (!targets?.length) return;

                countryMap[country] = targets;
            }),
            );
        }
        await Promise.all(promises);

        return countryMap;
        } catch (e) {
        passError(event, e);
        }
    },
    getMenusCacheOptions('nr7-menus', true, CACHE_TTL.CBD_API_LONG)
);

