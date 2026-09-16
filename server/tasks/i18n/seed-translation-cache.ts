/**
 * Nitro task wrapper for the translation-cache seed (plan decision D11 / ADR-0004).
 *
 * Deliberately thin: every decision, gate and pure transform lives in
 * `server/utils/thesaurus/seed-translation-cache.js`, which is the file `vitest.config.ts` measures
 * (`server/tasks/**` falls outside the coverage glob).
 *
 * Invoke:
 *   `runTask('i18n:seed-translation-cache')`                  -> dry run (default, writes nothing)
 *   `runTask('i18n:seed-translation-cache', { payload: { dryRun: false } })` -> live seed
 *
 * ⚠ **This task does not currently register, verified empirically on this branch (nuxt 4.2.1 /
 * nitropack 2.12.9, 2026-09-15).** `nitro.experimental.tasks: true` is set (`nuxt.config.ts:249`) and
 * `defineTask` is auto-imported and typed (`.nuxt/types/nitro-imports.d.ts:76`), but after `yarn build`
 * the string `i18n:seed-translation-cache` appears nowhere under `.output/` and no task chunk is emitted —
 * Nitro's `scanTasks` is not picking up `server/tasks/`. Until that wiring is fixed, a live seed must call
 * {@link runSeed} directly rather than going through `runTask`. The wrapper is kept because it is the
 * declared execution mechanism and carries no logic of its own; fixing the Nitro tasks integration is
 * outside this task's file scope.
 *
 * A live run is gated twice inside `runSeed` — the `thesaurus` mount must be durable, and a DB
 * reachability probe must succeed — and returns an `aborted` summary rather than a partial write if
 * either fails.
 */
import { runSeed } from '../../utils/thesaurus/seed-translation-cache.js';
import identifierLabels from '../../utils/thesaurus/identifier-labels.json';

export default defineTask({
  meta: {
    name: 'i18n:seed-translation-cache',
    description: 'Seed i18n_cache and the nitro label:tr namespace from existing locale-file label values (dry run unless payload.dryRun is false).'
  },
  /**
   * @param payload - `{ dryRun?: boolean }`. Omitted or `true` reports without writing.
   * @returns The run summary: per-locale counts, collisions, totals and elapsed time.
   */
  async run({ payload }) {
    const result = await runSeed(payload as { dryRun?: boolean }, {
      identifierLabels: identifierLabels as Record<string, string>,
      storage: useStorage('thesaurus')
    });
    return { result };
  }
});
