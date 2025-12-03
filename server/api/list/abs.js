/**
 * ABS (Access and Benefit-Sharing) list API endpoint.
 *
 * Queries the SCBD index for ABS-related content based on the current site context
 * and optional query parameters.
 *
 * @module server/api/list/abs
 *
 * @param {H3Event} event - The H3 event object containing request details
 * @returns {Promise<Object>} Index response containing:
 *   @returns {Array} data - Normalized index documents
 *   @returns {number} count - Total number of matching documents
 *   @returns {Object} facetCounts - Facet aggregation results
 *
 * @example
 * // GET /api/list/abs?schemas=focalPoint&countries=BE
 *
 * @throws {Error} Passes any errors to the error handler via passError
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const ctx   = getContext(event);
    const abs   = true;

    return queryScbdIndex({ ...ctx, ...query }, {},  false, abs);
    
  } catch (e) {
    passError(event, e);
  }
});
