import consola from 'consola';
import { getRequestURL } from 'h3';

/**
 * Nuxt plugin that intercepts $fetch requests to forward specific query parameters
 * from the original request to internal API calls. This enables cache-busting and
 * special processing flags to propagate through the request chain.
 *
 * @param {import('nuxt/app').NuxtApp} nuxtApp - The Nuxt application instance
 */
export default defineNuxtPlugin((nuxtApp) => {
  /** @type {string[]} Query parameters that should be forwarded to API requests */
  const forwardableParams = ['seachain-taisce', 'bypass-cache'];

  /**
   * Normalizes various query parameter formats into a plain object.
   *
   * @param {URLSearchParams | Array<[string, string]> | Record<string, unknown> | null | undefined} query - The query to normalize
   * @returns {Record<string, unknown>} A plain object representation of the query parameters
   */
  const normalizeQuery = (query) => {
    if (!query) return {};
    if (query instanceof URLSearchParams) return Object.fromEntries(query.entries());
    if (Array.isArray(query)) return Object.fromEntries(query);
    if (typeof query === 'object') return { ...query };

    return {};
  };

  /**
   * Extracts a query parameter value from the server-side request URL.
   *
   * @param {string} param - The name of the query parameter to retrieve
   * @returns {string | undefined} The parameter value, or undefined if not found or on error
   */
  const getServerParamValue = (param) => {
    const event = nuxtApp.ssrContext?.event;

    if (!event) return undefined;

    try {
      const requestURL = new URL(getRequestURL(event));

      return requestURL.searchParams.get(param) ?? undefined;
    } catch (error) {
      consola.warn('[cache-forward-query] Unable to parse server request URL', error);
      return undefined;
    }
  };

  /**
   * Extracts a query parameter value from the client-side Vue Router route.
   * Handles both single values and arrays (returns the last value for arrays).
   *
   * @param {string} param - The name of the query parameter to retrieve
   * @returns {string | undefined} The parameter value, or undefined if not found
   */
  const getClientParamValue = (param) => {
    const currentRoute = nuxtApp.$router?.currentRoute?.value;
    const value = currentRoute?.query?.[param];

    if (value === undefined || value === null) return undefined;

    return Array.isArray(value) ? value[value.length - 1] : String(value);
  };

  /**
   * Custom $fetch instance that intercepts requests to /api/* endpoints
   * and forwards whitelisted query parameters from the original request.
   *
   * @type {typeof $fetch}
   */
  const interceptedFetch = $fetch.create({
    /**
     * Request interceptor that merges forwardable query params into API requests.
     *
     * @param {object} context - The fetch request context
     * @param {string | Request} context.request - The request URL or Request object
     * @param {import('ofetch').FetchOptions} context.options - The fetch options
     */
    onRequest({ request, options }) {
      if (typeof request !== 'string' || !request.startsWith('/api')) return;

      /** @type {Record<string, string>} */
      const forwardedQuery = {};

      forwardableParams.forEach((param) => {
        const value = process.server ? getServerParamValue(param) : getClientParamValue(param);

        if (value !== undefined) forwardedQuery[param] = value;
      });

      if (!Object.keys(forwardedQuery).length) return;

      const normalizedQuery = normalizeQuery(options.query);

      options.query = { ...normalizedQuery, ...forwardedQuery };
    },
  });

  globalThis.$fetch = interceptedFetch;
  nuxtApp.$fetch = interceptedFetch;
});
