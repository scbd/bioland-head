/**
 * SSR-safe wrapper around randomArrayIndexTimeBased.
 *
 * During SSR the chosen index is frozen in the Nuxt payload via useState().
 * On client hydration the same value is restored — no mismatch.
 * On subsequent client-side navigations a fresh index is computed.
 *
 * @param   {string} key   — unique cache key (include data dimensions, e.g. 'hero-3')
 * @param   {number} total — number of items to choose from
 * @returns {Ref<number>}   reactive ref holding the stable index
 */
export function useSsrStableIndex(key, total) {
  if (!total || total <= 0) return ref(0)

  return useState(`ssr-idx-${key}`, () => randomArrayIndexTimeBased(total))
}
