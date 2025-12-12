/**
 * Retrieves Clearing-House Mechanism listings by merging the incoming request
 * query parameters with the contextual site metadata and forwarding the payload
 * to the SCBD search index.
 *
 * @param {H3Event} event - Nitro event containing request context and query parameters.
 * @returns {Promise<unknown>} Resolves with the aggregated search results returned by SCBD.
 * @throws {Error} Rethrows any error encountered so the caller receives a consistent response via passError.
 */
export default defineEventHandler(async (event) => {
    try{
            const query            = getQuery   (event);
            const ctx              = await useRequestContext(event);

            return queryScbdIndex ({ ...ctx, ...query });
        }
        catch (e) {
            passError(event, e);
        }
})
