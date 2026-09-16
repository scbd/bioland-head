import { initializeThesaurusSourceMap } from '../utils/thesaurus/source-map';
import { getBatchedLabel, TERM_LABEL_CONTEXT_KEY } from '../utils/thesaurus/request-batcher';

export default defineNitroPlugin((nitro) => {
  // Initialize thesaurus source map on app startup (warm the cache)
  initializeThesaurusSourceMap();

  /**
   * Hand the Vue app a label resolver through the request context (D3, p02-06).
   *
   * This is the Nitro/Vue-app bundle crossing, and it has to be a value passed at runtime rather than an
   * import. `app/composables/use-term-label.js` is bundled by Vite into the Vue app; `server/utils/**` is
   * bundled by Nitro. Verified empirically 2026-09-15 against a built server: a dynamic
   * `import('~~/server/utils/thesaurus/request-batcher')` from the composable *does* resolve and *does*
   * build clean, but Vite emits a second copy of the module into `.output/server/chunks/build/` with
   * Nitro's auto-imports left as free identifiers — `globalThis.useStorage` is `undefined` there, so every
   * label silently degraded to `{ source: 'identifier' }`, masked by `resolveTerms`' never-throw contract.
   * Registering the resolver here keeps the one real copy inside the Nitro bundle, where `useStorage` and
   * `getThesaurusByKey` are properly bound, and the composable only ever reads a function off the event.
   *
   * The closure is per-request so the batcher it opens is scoped to that request and nothing else.
   */
  nitro.hooks.hook('request', (event) => {
    event.context[TERM_LABEL_CONTEXT_KEY] = (identifier, locale, domain) =>
      getBatchedLabel(event, identifier, locale, domain);
  });
});
