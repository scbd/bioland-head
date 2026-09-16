/**
 * Read a resolved thesaurus label from the SSR payload (D3).
 *
 * ## Why the server injects a value instead of the app translating one
 *
 * Every taxonomy label rendered today comes from i18n — `t(identifier)` in a template. That layer is
 * unreachable from `server/`: a repo-wide grep for `useI18n` / `#i18n` / `@nuxtjs/i18n` under `server/`
 * returns nothing, and Nitro code has no component instance to call `useI18n()` against anyway. So a
 * server-rendered label cannot be produced the way the client produces one. The server resolves the label
 * to a plain string and hands it across in the Nuxt payload; this composable is the read side of that.
 *
 * ## Crossing the Nitro / Vue-app bundle boundary
 *
 * This file is bundled by Vite into the Vue app (client *and* server builds); `server/utils/**` is bundled
 * by Nitro. Two builds, two auto-import scopes — so **the crossing is a runtime value, not an import**:
 * `server/plugins/thesaurus.js` parks a resolver closure on every request's `event.context`, and the
 * server path below just reads it back off `useRequestEvent()`.
 *
 * ⚠ The obvious alternative — a dynamic `import('~~/server/utils/thesaurus/request-batcher')` behind an
 * `import.meta.server` guard — was tried first and **is a trap**. Verified empirically 2026-09-15 against
 * a built server: it resolves, it builds clean, it is correctly absent from the client bundle, and it is
 * still wrong. Vite emits a second copy of the Nitro module into `.output/server/chunks/build/` with
 * `useStorage` and `getThesaurusByKey` left as free identifiers — `globalThis.useStorage` is `undefined`
 * there — so `resolveTerms` threw internally and every label silently degraded to the raw identifier,
 * caught by its own never-throw contract and invisible in dev. Do not reintroduce that import.
 *
 * `import.meta.server` (not `process.server`) remains the repo's server-guard convention for the branch
 * below — `app/middleware/02.bioland.global.js:275`, `app/middleware/01.localhost-dev.global.js:39`.
 *
 * ## The three read paths
 *
 * 1. **Already resolved.** `useState('term-labels')` holds it — either an earlier call in this same render
 *    resolved it, or it hydrated out of the SSR payload. Returned with no I/O at all, which is what makes
 *    the hydrated case mismatch-proof by construction: client and server read the identical value.
 * 2. **Server resolve.** Absent during SSR → `getBatchedLabel`, awaited inline so the component's own
 *    render waits for the real value instead of rendering a placeholder and swapping it. Concurrent calls
 *    in the same tick collapse into one `resolveTerms`.
 * 3. **Client fetch.** Absent on the client → `POST /api/thesaurus/terms`. Reached only by a component that
 *    never ran server-side, so its ids were never in any SSR batch. Exactly one such surface exists today:
 *    `app/components/swiper/content-type/index.vue:63`, inside a `<ClientOnly>` Swiper.
 *
 * ⚠ **No component calls this yet.** Phase 03's cutover tasks are the first, and are where the batching
 * window and the hydration design get their first real multi-component exercise.
 */

/** The payload key. Identical server- and client-side, which is what makes Nuxt rehydrate it. */
export const TERM_LABEL_STATE_KEY = 'term-labels';

/**
 * The `event.context` property `server/plugins/thesaurus.js` puts the per-request resolver on.
 *
 * ⚠ Duplicated from `TERM_LABEL_CONTEXT_KEY` in `server/utils/thesaurus/request-batcher.ts` on purpose —
 * importing it from there would pull the Nitro-only module into this bundle, which is the failure
 * documented above. Change one and you must change the other.
 */
const TERM_LABEL_CONTEXT_KEY = 'getTermLabel';

/**
 * Current locale, from the one source the rest of `app/composables/**` already uses (`media.js:6`,
 * `seo.js:268`, `schema-org.js:200`). Falls back to `en` when there is no i18n context (unit harness).
 *
 * @returns {string}
 */
function currentLocale() {
  try {
    return unref(useI18n()?.locale) || 'en';
  } catch {
    return 'en';
  }
}

/**
 * Resolve during SSR through the per-request batcher the Nitro plugin exposed on the event context.
 * Returns `null` rather than throwing, so a failure degrades to the raw identifier instead of breaking
 * the render — and so does a missing resolver (no request event, or a context the plugin never saw).
 *
 * @param   {string} identifier
 * @param   {string} locale
 * @returns {Promise<{ value: string, source: string } | null>}
 */
async function resolveOnServer(identifier, locale) {
  try {
    const getTermLabel = useRequestEvent()?.context?.[TERM_LABEL_CONTEXT_KEY];
    if (typeof getTermLabel !== 'function') return null;
    const label = await getTermLabel(identifier, locale);
    return label && typeof label.value === 'string' ? label : null;
  } catch {
    return null;
  }
}

/**
 * Resolve on the client through the batch endpoint (`p02-02`). The locale rides as a query param because
 * that is how this codebase's internal client fetches tell the server context which locale they mean
 * (`server/utils/context-unified.ts:126-128`).
 *
 * @param   {string} identifier
 * @param   {string} locale
 * @returns {Promise<{ value: string, source: string } | null>}
 */
async function resolveOnClient(identifier, locale) {
  try {
    const resolved = await $fetch('/api/thesaurus/terms', {
      method: 'POST',
      query: { locale },
      body: { ids: [identifier] }
    });
    const label = resolved?.[identifier];
    return label && typeof label.value === 'string' ? label : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a thesaurus identifier to a display label, sharing the result through the SSR payload.
 *
 * Asynchronous by design: awaiting it in `<script setup>` makes the SSR render genuinely wait for the
 * resolved value (Suspense), so nothing renders a placeholder that a later tick has to swap out. The
 * returned ref stays reactive, so a value another caller resolves later still propagates.
 *
 * @param   {import('vue').MaybeRefOrGetter<string>} identifier - Thesaurus identifier, e.g. `GBF-TARGET-01`.
 * @returns {Promise<import('vue').ComputedRef<string>>} The label, falling back to the raw identifier.
 *
 * @example
 * // <script setup>
 * const label = await useTermLabel(() => props.identifier);
 * // <template>{{ label }}</template>
 */
export async function useTermLabel(identifier) {
  const labels = useState(TERM_LABEL_STATE_KEY, () => ({}));

  const label = computed(() => {
    const key = toValue(identifier);
    if (typeof key !== 'string' || !key) return '';
    return labels.value?.[key]?.value ?? key;
  });

  const id = toValue(identifier);
  if (typeof id !== 'string' || !id) return label;
  // Path 1 — already in the payload (hydrated) or resolved earlier in this render. No fetch, ever.
  if (labels.value?.[id]) return label;

  const locale = currentLocale();

  // Path 2 — `useRequestEvent()` is undefined on the client, so this is a no-op there by construction.
  let resolved = await resolveOnServer(id, locale);

  // Path 3 — client only. The `import.meta.server` guard is what stops a *failed* server resolve from
  // turning into a pointless server-to-self HTTP call: during SSR a miss degrades to the identifier.
  if (!resolved && !import.meta.server) resolved = await resolveOnClient(id, locale);

  if (resolved) labels.value[id] = resolved;

  return label;
}
