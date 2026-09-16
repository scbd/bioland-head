/**
 * Boot-time warm start (p04-02): hydrate the `label:tr:{V}` cache tier from rows already sitting in
 * MariaDB `i18n_cache`, coordinated across containers so exactly one hydrates and every other skips.
 *
 * ## Why a lock, and why the connection handling looks different from the rest of this module's family
 *
 * `./cache` is a shared volume across every container (D9), so one hydrate genuinely warms the fleet —
 * every other container hydrating too would be pure duplicated work, not extra safety. Coordination uses
 * MariaDB's own `GET_LOCK`/`RELEASE_LOCK` via {@link acquireHydrationLock}/{@link releaseHydrationLock}.
 * Those two are **session-scoped**: the lock lives on the specific connection that acquired it, so this
 * function holds that one connection for the entire acquire -> hydrate -> release sequence and only lets
 * it go, via `releaseHydrationLock`, once hydration (success or failure) is fully done. Returning the
 * connection to the pool any earlier — even without an explicit `RELEASE_LOCK` — drops the lock and lets
 * every container "win" on its own separate connection, which is exactly the silent N-way concurrent
 * hydration this whole task exists to prevent.
 *
 * ## The identifier <-> English-text join
 *
 * `i18n_cache` has no thesaurus-identifier column — it is content-addressed by English source text
 * (`cache_key`), while the nitro cache this function writes is keyed by identifier
 * (`label:tr:{V}:{id}:{locale}`). The bridge is `p03-01`'s committed `identifier -> englishLabel` map
 * (`server/utils/thesaurus/identifier-labels.json`, reshaped via
 * {@link deserializeIdentifierLabels}). If that map cannot be found or fails to parse, this function
 * aborts the hydration attempt — it never invents a fallback join (never reads `i18n/locales/en.json`
 * live as a substitute; see `phase-04/context.md` § The MariaDB contract) and never guesses a
 * correlation. A fresh environment that never ran `p03-01`'s seeding must still boot on a cold cache.
 *
 * ## Marker versioning
 *
 * The completion marker (`hydration-marker:{LABEL_CACHE_VERSION}`) is scoped to the same version every
 * `label:tr:*` key already embeds, so bumping {@link LABEL_CACHE_VERSION} (the existing D6 eviction
 * mechanism) makes every container attempt exactly one fresh hydration under the new version, instead of
 * every container reading a stale marker and skipping forever.
 *
 * @module server/utils/thesaurus/hydrate-i18n-cache
 */
import { LABEL_CACHE_VERSION, buildLabelKey } from './resolve-terms';
import { deserializeIdentifierLabels, SIX_MONTHS_MS } from './seed-translation-cache';
import { acquireHydrationLock, releaseHydrationLock, getCachedTranslationsPage } from '../translate/index.js';
import identifierLabelsFile from './identifier-labels.json';

/** `i18n_cache.source_locale` this hydrator reads from — mirrors `translate/index.js`'s own default. */
const SOURCE_LOCALE = 'en';

/** Advisory lock name shared by every container racing to hydrate. */
const LOCK_NAME = 'i18n-cache-hydration';

/** Rows fetched per `i18n_cache` page. Never issue an unbounded `SELECT *`. */
const HYDRATION_PAGE_SIZE = 500;

/** A truncated `getCacheKey` hash is a 64-character lowercase hex SHA-256 digest — see `getCacheKey`. */
const TRUNCATED_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** @returns The version-scoped completion marker key in `useStorage('thesaurus')`. */
function markerKey(): string {
  return `hydration-marker:${LABEL_CACHE_VERSION}`;
}

/**
 * Default reader for `p03-01`'s committed identifier -> englishLabel map. Injectable via
 * {@link hydrateI18nCache}'s `deps` so tests never touch the real filesystem.
 *
 * Reads `identifierLabelsFile` via a **static** import rather than a runtime `fs.readFile` against
 * `process.cwd()`: the production Docker image (`Dockerfile`) copies only the built `.output`
 * directory into the container, so a source-tree-relative `fs` read of
 * `server/utils/thesaurus/identifier-labels.json` finds nothing there and this function would abort
 * hydration on every boot. A static import is traced by Nitro's build and inlined into the server
 * bundle, so the data ships regardless of what the Dockerfile copies — the same pattern already used
 * by `server/tasks/i18n/seed-translation-cache.ts`.
 *
 * @returns The identifier -> englishLabel map, or `null` if the bundled file fails to parse.
 */
async function readIdentifierLabelMap(): Promise<Record<string, string> | null> {
  try {
    return deserializeIdentifierLabels(identifierLabelsFile as { labels: Array<{ identifier: string; label: string }> });
  } catch {
    return null;
  }
}

/** Invert `identifier -> englishLabel` to `englishLabel -> identifier[]` (a label can be shared). */
function invertLabelMap(identifierLabels: Record<string, string>): Map<string, string[]> {
  const byEnglishLabel = new Map<string, string[]>();
  for (const [identifier, englishLabel] of Object.entries(identifierLabels)) {
    const identifiers = byEnglishLabel.get(englishLabel);
    if (identifiers) identifiers.push(identifier);
    else byEnglishLabel.set(englishLabel, [identifier]);
  }
  return byEnglishLabel;
}

/** Minimal logger surface this function needs — satisfied by `consola` or `console`. */
interface HydrationLogger {
  debug?: (...args: unknown[]) => void;
  success?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
}

/** Minimal storage surface this function needs — satisfied by a `useStorage('thesaurus')` instance. */
interface HydrationStorage {
  getItem: (key: string) => Promise<unknown>;
  setItem: (key: string, value: unknown) => Promise<void>;
}

/** One page of `i18n_cache` rows, as returned by {@link getCachedTranslationsPage}. */
interface CachedTranslationRow {
  source_locale: string;
  target_locale: string;
  cache_key: string;
  translation_value: string;
}

/** Injectable dependency seam — every field defaults to the real implementation. */
interface HydrateDeps {
  runtimeConfig?: { hydrateI18nCache?: boolean };
  storage?: HydrationStorage | null;
  logger?: HydrationLogger;
  isDev?: boolean;
  acquireLockFn?: typeof acquireHydrationLock;
  releaseLockFn?: typeof releaseHydrationLock;
  getPageFn?: (offset: number, limit: number) => Promise<CachedTranslationRow[]>;
  readIdentifierLabels?: () => Promise<Record<string, string> | null>;
  now?: number;
}

/**
 * Hydrate the `label:tr:{V}` cache tier from MariaDB `i18n_cache`, coordinated so exactly one
 * container performs the work per boot generation.
 *
 * **Never throws.** Every failure path — the feature flag off, dev mode, no durable storage mount, the
 * marker already present, the lock already held elsewhere, `p03-01`'s identifier map absent or
 * unparseable, or MariaDB unreachable — resolves this promise normally, logging via `consola.warn` (or
 * the injected logger) where the outcome is unexpected. This mirrors `initializeThesaurusSourceMap`'s
 * contract (`server/utils/thesaurus/source-map.js:284-291`), the pattern `server/plugins/thesaurus.js`
 * already relies on for a non-blocking boot.
 *
 * @param deps - Injection seam for tests; every field defaults to the real implementation.
 */
export async function hydrateI18nCache(deps: HydrateDeps = {}): Promise<void> {
  // Resolving `deps.logger` can never throw (a plain property read/default, no Nitro context
  // involved), so it is safe to do outside the try — unlike `runtimeConfig`/`storage` below, whose
  // real implementations (`useRuntimeConfig`/`useStorage`) need a live Nitro request context and
  // can throw when boot calls this before or outside one. Resolving `logger` here means the
  // catch below can always warn through the caller's own injected logger, not just a fallback.
  const logger: HydrationLogger = deps.logger ?? (typeof consola !== 'undefined' ? consola : console);

  try {
    const {
      runtimeConfig = typeof useRuntimeConfig === 'function' ? useRuntimeConfig() : {},
      storage = typeof useStorage === 'function' ? (useStorage('thesaurus') as HydrationStorage) : null,
      isDev = typeof process !== 'undefined' && process.dev === true,
      acquireLockFn = acquireHydrationLock,
      releaseLockFn = releaseHydrationLock,
      getPageFn = getCachedTranslationsPage,
      readIdentifierLabels = readIdentifierLabelMap,
      now = Date.now()
    } = deps;

    // Flag gate, first — no useStorage/MariaDB touch at all when disabled.
    if (runtimeConfig?.hydrateI18nCache === false) {
      logger.debug?.('[i18n-cache-hydrator] disabled via runtimeConfig.hydrateI18nCache; skipping');
      return;
    }

    // Deliberate divergence from `thesaurus.js` (which has no dev guard): a dev Nitro restart fires
    // on nearly every server-file save, and each restart would open a real MariaDB connection and
    // contend for a real advisory lock — wasteful, and if a developer's env points at a shared
    // database, contentious with other developers'/environments' hydration attempts, for no benefit
    // since `p04-01` already fills the cache reactively as a developer exercises the app locally.
    if (isDev) {
      logger.debug?.('[i18n-cache-hydrator] skipped in dev mode; p04-01 fills the cache reactively');
      return;
    }

    if (!storage) {
      logger.warn?.('[i18n-cache-hydrator] no thesaurus storage mount available; skipping');
      return;
    }

    const marker = markerKey();

    // Check the marker before anything else touches MariaDB — a second container skips without any
    // DB call on this path.
    if (await storage.getItem(marker)) {
      logger.debug?.(`[i18n-cache-hydrator] ${marker} already present; skipping`);
      return;
    }

    const lockResult = await acquireLockFn(LOCK_NAME);
    if (!lockResult.locked) {
      // No polling, no retry — this container's job is done for this boot regardless of whether the
      // winner has finished yet.
      logger.debug?.('[i18n-cache-hydrator] lock held by another container; skipping');
      return;
    }

    try {
      // Double-checked locking: a container could have finished and written the marker in the gap
      // between the first marker read and acquiring the lock.
      if (await storage.getItem(marker)) {
        logger.debug?.(`[i18n-cache-hydrator] ${marker} written while waiting for the lock; skipping`);
        return;
      }

      const identifierLabels = await readIdentifierLabels();
      if (!identifierLabels || Object.keys(identifierLabels).length === 0) {
        // Abort condition (war-game A1 / task Step 10): never invent a fallback join.
        logger.warn?.(
          '[i18n-cache-hydrator] server/utils/thesaurus/identifier-labels.json is absent or empty; skipping hydration'
        );
        return;
      }

      const byEnglishLabel = invertLabelMap(identifierLabels);
      const expiresAt = now + SIX_MONTHS_MS;

      let offset = 0;
      let rowsRead = 0;
      let entriesWritten = 0;
      let skippedTruncated = 0;
      let skippedCollision = 0;

      for (;;) {
        const page = await getPageFn(offset, HYDRATION_PAGE_SIZE);
        if (!page?.length) break;

        rowsRead += page.length;

        for (const row of page) {
          if (row.source_locale !== SOURCE_LOCALE) continue;

          const identifiers = byEnglishLabel.get(row.cache_key);
          if (!identifiers) {
            // Either truly unrelated (e.g. text translated via the generic /api/translate endpoint
            // for non-thesaurus content) or a truncated-hash proxy for source text over 499
            // characters (getCacheKey's threshold), which cannot match a plain-text reverse lookup.
            if (TRUNCATED_HASH_PATTERN.test(row.cache_key)) skippedTruncated += 1;
            continue;
          }

          if (identifiers.length > 1) {
            // `i18n_cache` is content-addressed by English text alone, so this one row can only ever
            // hold a single `translation_value` per (cache_key, target_locale) pair — it carries no
            // per-identifier distinction. `detectLabelCollisions` (seed-translation-cache.js) already
            // proved that identifiers sharing an English label can legitimately want *different*
            // locale values (the committed data's real `eu` conflict between `CBD-SUBJECT-NBSAP` and
            // `doc-14`), and the seeder withholds those rather than guessing. Boot-time hydration has
            // no locale-file data to re-run that per-locale check against, so it withholds identically:
            // every identifier on a shared label is skipped here rather than risking a silently wrong
            // label. `resolve-terms`'s normal reactive fetch (p04-01) still fills these in correctly.
            skippedCollision += identifiers.length;
            continue;
          }

          await storage.setItem(buildLabelKey('tr', identifiers[0], row.target_locale), {
            value: row.translation_value,
            source: 'translation',
            expiresAt
          });
          entriesWritten += 1;
        }

        if (page.length < HYDRATION_PAGE_SIZE) break;
        offset += HYDRATION_PAGE_SIZE;
      }

      if (skippedCollision > 0) {
        logger.debug?.(`[i18n-cache-hydrator] withheld ${skippedCollision} rows sharing a collision-prone English label`);
      }

      if (skippedTruncated > 0) {
        logger.debug?.(`[i18n-cache-hydrator] skipped ${skippedTruncated} truncated-hash rows`);
      }

      // Write the marker only after the full page loop completes successfully.
      await storage.setItem(marker, { hydratedAt: Date.now(), rowsRead, entriesWritten });
      logger.success?.(
        `[i18n-cache-hydrator] hydrated ${entriesWritten} label:tr entries from ${rowsRead} i18n_cache rows`
      );
    } finally {
      // Wraps the whole acquire-lock-onward block: a thrown error anywhere in the page loop still
      // releases the lock.
      await releaseLockFn({ connection: lockResult.connection, lockName: LOCK_NAME });
    }
  } catch (error) {
    logger.warn?.(
      `[i18n-cache-hydrator] hydration failed, cache stays cold this boot: ${(error as Error)?.message ?? error}`
    );
  }
}
