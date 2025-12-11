/**
 * BCH (Biosafety Clearing-House) list API endpoint.
 *
 * Queries the SCBD index for BCH-related content based on the current site context
 * and optional query parameters.
 *
 * @module server/api/list/bch
 *
 * @param {H3Event} event - The H3 event object containing request details
 * @returns {Promise<Object>} Index response containing:
 *   @returns {Array} data - Normalized index documents
 *   @returns {number} count - Total number of matching documents
 *   @returns {Object} facetCounts - Facet aggregation results
 *
 * @example
 * // GET /api/list/bch?schemas=focalPoint&countries=BE
 *
 * @throws {Error} Passes any errors to the error handler via passError
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const ctx   = await useRequestContext(event);
    const bch   = true;

    return queryScbdIndex({ ...ctx, ...query }, {}, bch);
    
  } catch (e) {
    passError(event, e);
  }
});
