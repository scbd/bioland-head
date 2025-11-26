import consola from 'consola';
import { getRequestURL } from 'h3';

export default defineNuxtPlugin((nuxtApp) => {
  const forwardableParams = ['seachain-taisce', 'bypass-cache'];

  const normalizeQuery = (query) => {
    if (!query) return {};
    if (query instanceof URLSearchParams) return Object.fromEntries(query.entries());
    if (Array.isArray(query)) return Object.fromEntries(query);
    if (typeof query === 'object') return { ...query };

    return {};
  };

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

  const getClientParamValue = (param) => {
    const currentRoute = nuxtApp.$router?.currentRoute?.value;
    const value = currentRoute?.query?.[param];

    if (value === undefined || value === null) return undefined;

    return Array.isArray(value) ? value[value.length - 1] : String(value);
  };

  const interceptedFetch = $fetch.create({
    onRequest({ request, options }) {
      if (typeof request !== 'string' || !request.startsWith('/api')) return;

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
