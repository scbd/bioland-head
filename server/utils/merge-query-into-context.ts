type Bag = Record<string, unknown>;

/**
 * Merge a request query into the server-derived site context with the context winning (BL-1135).
 *
 * Every key the context resolved - host, localizedHost, baseHost, siteCode, identifier, locale,
 * locales, config, redirect and any route-derived key a handler added (forumAlias, tid, topicId) -
 * keeps its server value, so a crafted `?localizedHost=https://evil.example` cannot point a Drupal
 * or index fetch at another host. Every other query key (paging, filters, ids) passes through.
 *
 * `country`/`countries` are server-only too. The handlers that read them are cached per
 * site and locale, so a client value would be served to every visitor of the site. The client's
 * own list (siteStore.countries) is built from the same DMSM `config.country`/`config.countries`.
 *
 * `locale` needs no carve-out: useRequestContext already adopts a query locale the site serves,
 * so a legitimate `?locale=` yields the same value here and an unserved one is dropped.
 *
 * @param ctx - Site context from useRequestContext, plus any route-derived keys.
 * @param query - The request query from getQuery.
 */
export function mergeQueryIntoContext<C extends Bag, Q extends Bag>(ctx: C, query: Q = {} as Q): Omit<Q, keyof C> & C {
  return { ...query, ...ctx } as Omit<Q, keyof C> & C;
}

/**
 * The query to forward on an internal `$fetch` to another API route.
 *
 * Internal fetches carry no Host header, so the target route resolves its site from
 * `query.siteCode` (then the context cookie). Forwarding the client's raw query would let
 * `?siteCode=` pick a different tenant than the one the request's Host resolved to, so the
 * server's own siteCode and locale replace whatever the client sent.
 *
 * @param ctx - Site context from useRequestContext.
 * @param query - The request query to forward.
 */
export const internalQuery = <Q extends Bag>(ctx: { siteCode?: unknown; locale?: unknown }, query: Q = {} as Q) =>
  ({ ...query, siteCode: ctx.siteCode, locale: ctx.locale });
