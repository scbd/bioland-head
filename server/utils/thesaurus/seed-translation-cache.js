/**
 * Seed the translation cache (MariaDB `i18n_cache` + the nitro `label:tr:` namespace) from the label
 * values already sitting in the 82 `i18n/locales/*.json` files (plan decision D11 / ADR-0004).
 *
 * ## Why this module exists separately from the Nitro task
 *
 * `vitest.config.ts`'s coverage `include` does not cover `server/tasks/**`, and the repo's established
 * pattern is a thin handler over a testable util. Every decision below therefore lives here;
 * `server/tasks/i18n/seed-translation-cache.ts` does nothing but call {@link runSeed}.
 *
 * ## The three hazards this module is built around
 *
 * 1. **`i18n_cache` is content-addressed by English source text, not by identifier.** `cache_key` stores
 *    the literal English label ({@link getCacheKey} only hashes text over 499 chars) and the table has no
 *    identifier column. Two *different* identifiers that share an English label therefore collide on one
 *    row, and `saveCachedTranslations`' `ON DUPLICATE KEY UPDATE` would let whichever is written last win
 *    silently. See {@link detectLabelCollisions} — collisions are reported and skipped, never resolved.
 * 2. **`cache_key_hash` is `VARBINARY(32) GENERATED ALWAYS AS (SHA2(cache_key,256)) STORED`** — supplying
 *    it fails the insert. Nothing here ever builds a hash column; {@link buildDbRows} emits exactly the
 *    `{ cacheKey, sourceText, translation }` shape `saveCachedTranslations` expects.
 * 3. **The pool is a shared singleton with `I18N_DB_CONNECTION_LIMIT` (default 5).** Locales are processed
 *    strictly one at a time, one batched `saveCachedTranslations` call each, and `closeDbPool()` is never
 *    called — the pool is shared with the live `/api/translate/*` endpoints.
 *
 * ## Safety posture
 *
 * {@link runSeed} is **dry-run by default**. A live run requires an explicit `dryRun: false` *and* passes
 * two gates first: the durable-storage mount gate and a DB reachability probe. See {@link runSeed}.
 *
 * @module server/utils/thesaurus/seed-translation-cache
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { LABEL_CACHE_VERSION, buildLabelKey } from './resolve-terms';
import { getCacheKey, getCachedTranslations, saveCachedTranslations } from '../translate/index.js';

/**
 * First key of the taxonomy candidate window in `i18n/locales/en.json`.
 *
 * Provenance: the adopted block is index range `[380, 1059]` (680 keys) of `en.json`'s key order, per the
 * plan's key-classification research. The **indices are not stored** — `en.json` drifts (it held 1078 keys
 * when this map was generated, against the research's 1080), so the boundaries are pinned by key *name*
 * and the index range is recomputed at authoring time. This GUID is the first `regions` term.
 */
export const BLOCK_FIRST_KEY = 'CCA4B662-8EF4-418D-B327-0D6F418AA703';

/**
 * Last key of the taxonomy candidate window. Provenance as {@link BLOCK_FIRST_KEY}.
 *
 * Note this sentinel is itself an identity-mapped UI string (`"Contact" -> "Contact"`) and is therefore
 * excluded from the seed set by {@link buildIdentifierLabelMap}'s identity filter. It bounds the window;
 * it is not seeded.
 */
export const BLOCK_LAST_KEY = 'Contact';

/** Six months in ms — the `label:tr:` tier's lifetime per the resolver's storage contract (D6). */
export const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182;

/** Max nitro `setItem` calls in flight at once within one locale. Unrelated to the DB pool. */
const STORAGE_CHUNK_SIZE = 50;

/** Probe text for the DB reachability check. Deliberately never a real label, so it can never match. */
const DB_PROBE_TEXT = '__i18n_seed_connectivity_probe__';

/** Locale files that are not locales. */
const NON_LOCALE_FILES = new Set(['en.json']);

/**
 * Build the durable `{ identifier: englishLabel }` map from `en.json`.
 *
 * Two rules, in order:
 *
 * 1. **Sentinel-bounded window.** Take every key between {@link BLOCK_FIRST_KEY} and
 *    {@link BLOCK_LAST_KEY} inclusive. Throws if either sentinel is missing or out of order — `en.json`
 *    has drifted and guessing a range would silently seed the wrong keys.
 * 2. **Identity filter — `key === value` keys are dropped.** A key whose value is itself (`"Contact"`,
 *    `"High"`, `"Task"`, `"Key"`, `"Summary"`) is an English UI string used as its own i18n key, not a
 *    taxonomy identifier. 64 of the window's 680 keys are these, and they are the *worst* rows to seed:
 *    they are short generic English words that almost certainly already have `i18n_cache` rows written by
 *    real `/api/translate` production traffic, so seeding them maximises the hazard-1 collision surface
 *    while delivering nothing — no downstream cutover resolves a UI string against the thesaurus, and
 *    `translateText` already handles that text natively on the same content address.
 *
 * @param {Record<string, string>} enJson - Parsed `i18n/locales/en.json`.
 * @returns {Record<string, string>} identifier -> English label, insertion-ordered as in `en.json`.
 * @throws {Error} If either sentinel is absent, or the last sentinel precedes the first.
 */
export function buildIdentifierLabelMap(enJson) {
  const keys = Object.keys(enJson ?? {});
  const startIdx = keys.indexOf(BLOCK_FIRST_KEY);
  const endIdx = keys.indexOf(BLOCK_LAST_KEY);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `en.json sentinel drift: BLOCK_FIRST_KEY ${startIdx === -1 ? 'missing' : 'found'}, ` +
      `BLOCK_LAST_KEY ${endIdx === -1 ? 'missing' : 'found'}. Refusing to guess the taxonomy block.`
    );
  }
  if (startIdx > endIdx) {
    throw new Error(`en.json sentinel drift: BLOCK_LAST_KEY precedes BLOCK_FIRST_KEY (${endIdx} < ${startIdx}).`);
  }

  /** @type {Record<string, string>} */
  const map = Object.create(null);
  for (const key of keys.slice(startIdx, endIdx + 1)) {
    if (key !== enJson[key]) map[key] = enJson[key];
  }
  return map;
}

/**
 * Pair every identifier in the committed map against one locale file's value for it.
 *
 * Keys absent from the locale file are skipped outright — required, since all 81 non-`en` files diverge
 * from `en.json` (`no`/`ps` are missing over a thousand keys; eight files are missing exactly 243). Pairs
 * whose two labels happen to be identical are **kept**: an untranslated locale legitimately serves the
 * English string, and dropping it would make the resolver fall through to a fresh machine translation.
 *
 * @param {Record<string, string>} identifierLabels - The committed identifier -> English label map.
 * @param {Record<string, string>} localeJson - One parsed `i18n/locales/<locale>.json`.
 * @returns {{ pairs: Array<{identifier: string, englishLabel: string, localeLabel: string}>, skippedMissing: number }}
 */
export function buildSeedPairs(identifierLabels, localeJson) {
  const pairs = [];
  let skippedMissing = 0;

  for (const [identifier, englishLabel] of Object.entries(identifierLabels)) {
    const localeLabel = localeJson?.[identifier];
    if (typeof localeLabel !== 'string' || localeLabel === '') {
      skippedMissing += 1;
      continue;
    }
    pairs.push({ identifier, englishLabel, localeLabel });
  }

  return { pairs, skippedMissing };
}

/**
 * Split a locale's pairs into those safe to write and those that collide on a shared English label.
 *
 * Because the row is addressed by `cache_key` (the English label), two identifiers sharing that label map
 * to **one** row that can hold only one `translation_value`. When their locale values agree the row is
 * unambiguous and both pairs are safe. When they disagree there is no correct automatic answer, so
 * **every** pair on that label is withheld and reported — never "last writer wins".
 *
 * Measured against the real data: 2 of the 616 identifiers' labels are shared, and exactly one produces a
 * genuine conflict (`eu`, `CBD-SUBJECT-NBSAP` vs `doc-14`).
 *
 * `deduped` counts the *agreeing* extras collapsed onto a shared row. It is deliberately reported apart
 * from the withheld conflicts: collapsing two identifiers that already agree loses nothing, whereas a
 * withheld conflict is data this task refused to write. Conflating the two in one "skipped" number makes a
 * clean run look like it dropped 142 rows.
 *
 * @param {Array<{identifier: string, englishLabel: string, localeLabel: string}>} pairs
 * @returns {{ safe: Array<object>, collisions: Array<{englishLabel: string, identifiers: string[], values: string[]}>, deduped: number, withheld: number }}
 */
export function detectLabelCollisions(pairs) {
  /** @type {Map<string, Array<object>>} */
  const byLabel = new Map();
  for (const pair of pairs) {
    const group = byLabel.get(pair.englishLabel);
    group ? group.push(pair) : byLabel.set(pair.englishLabel, [pair]);
  }

  const safe = [];
  const collisions = [];
  let deduped = 0;
  let withheld = 0;

  for (const [englishLabel, group] of byLabel) {
    const distinct = new Set(group.map(p => p.localeLabel));
    if (distinct.size <= 1) {
      safe.push(group[0]);
      deduped += group.length - 1;
      continue;
    }
    withheld += group.length;
    collisions.push({
      englishLabel,
      identifiers: group.map(p => p.identifier),
      values: [...distinct]
    });
  }

  return { safe, collisions, deduped, withheld };
}

/**
 * Map seed pairs to the exact record shape `saveCachedTranslations` accepts.
 *
 * Never emits `cache_key_hash` — that column is DB-generated and supplying it fails the insert (hazard 2).
 *
 * @param {Array<{englishLabel: string, localeLabel: string}>} pairs
 * @param {(text: string) => string} [cacheKeyFn] - Injectable for tests; defaults to {@link getCacheKey}.
 * @returns {Array<{cacheKey: string, sourceText: string, translation: string}>}
 */
export function buildDbRows(pairs, cacheKeyFn = getCacheKey) {
  return pairs.map(({ englishLabel, localeLabel }) => ({
    cacheKey: cacheKeyFn(englishLabel),
    sourceText: englishLabel,
    translation: localeLabel
  }));
}

/**
 * Map seed pairs to nitro `label:tr:{V}:{id}:{locale}` entries.
 *
 * The envelope carries an explicit `expiresAt` because neither the `fs` driver nor the memory driver
 * honours `setItem`'s `ttl` option — the resolver enforces expiry in code, so a bare `ttl` would be inert.
 *
 * @param {Array<{identifier: string, localeLabel: string}>} pairs
 * @param {string} locale
 * @param {number} now - Epoch ms the six-month window is measured from.
 * @returns {Array<{key: string, entry: {value: string, source: 'translation', expiresAt: number}}>}
 */
export function buildStorageEntries(pairs, locale, now) {
  const expiresAt = now + SIX_MONTHS_MS;
  return pairs.map(({ identifier, localeLabel }) => ({
    key: buildLabelKey('tr', identifier, locale),
    entry: { value: localeLabel, source: 'translation', expiresAt }
  }));
}

/**
 * Read the `thesaurus` mount off the resolved Nitro storage and report whether it is durable.
 *
 * The gate exists because `useStorage('thesaurus')` falls through to Nitro's **in-memory** driver when no
 * mount is declared: writes appear to succeed and are lost on restart, silently defeating the whole task.
 * This is an explicit runtime check, not a comment, and a live run refuses to start without it.
 *
 * @param {{ getMount?: (base: string) => { driver?: { name?: string } } }} storage
 * @returns {boolean} True when the mount resolves to something other than the memory driver.
 */
export function hasDurableThesaurusMount(storage) {
  try {
    const driverName = storage?.getMount?.('')?.driver?.name;
    return typeof driverName === 'string' && driverName !== 'memory';
  } catch {
    return false;
  }
}

/**
 * Seed the translation cache, or report what a seed would do.
 *
 * **Dry-run is the default.** `runSeed()` and `runSeed({})` both report without writing; a live run needs
 * an explicit `dryRun: false`. A live run then passes two gates before the first write:
 *
 * 1. **Durable-storage gate** ({@link hasDurableThesaurusMount}) — refuses if `thesaurus` is unmounted.
 * 2. **DB reachability probe** — one no-side-effect `getCachedTranslations` round trip. If it throws,
 *    nothing is written to either store.
 *
 * Locales are then processed **one at a time**: per locale, one collision pass, one existing-row check,
 * one batched `saveCachedTranslations`, then the nitro entries in chunks of {@link STORAGE_CHUNK_SIZE}.
 * MariaDB is always written before its nitro entries, because a nitro entry with no backing row does not
 * self-heal until its six-month expiry, whereas the reverse does.
 *
 * A locale file that fails to parse is skipped and recorded, never fatal.
 *
 * @param {{ dryRun?: boolean }} [payload]
 * @param {object} [deps] - Injection seam for tests; every field defaults to the real implementation.
 * @returns {Promise<object>} The run summary (also the Nitro task's result).
 */
export async function runSeed(payload = {}, deps = {}) {
  const startedAt = Date.now();
  const dryRun = payload?.dryRun !== false;

  const {
    identifierLabels = null,
    localesDir = path.resolve(process.cwd(), 'i18n/locales'),
    readDir = (dir) => fs.readdir(dir),
    readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8')),
    storage = typeof useStorage === 'function' ? useStorage('thesaurus') : null,
    getCachedFn = getCachedTranslations,
    saveFn = saveCachedTranslations,
    cacheKeyFn = getCacheKey,
    now = Date.now(),
    logger = console
  } = deps;

  const labels = identifierLabels ?? (await readJson(path.join(process.cwd(), 'server/utils/thesaurus/identifier-labels.json')));
  const identifierCount = Object.keys(labels).length;

  const summary = {
    mode: dryRun ? 'dry-run' : 'live',
    labelCacheVersion: LABEL_CACHE_VERSION,
    identifierCount,
    durableStorageMount: hasDurableThesaurusMount(storage),
    locales: [],
    collisions: [],
    totals: {
      candidates: 0,
      wouldWrite: 0,
      dbRowsWritten: 0,
      storageEntriesWritten: 0,
      skippedMissing: 0,
      dedupedSharedLabel: 0,
      withheldCollision: 0,
      skippedExistingConflict: 0
    },
    unparseableFiles: [],
    aborted: null,
    elapsedMs: 0
  };

  if (!dryRun && !summary.durableStorageMount) {
    summary.aborted = 'durable-storage-gate: useStorage("thesaurus") is not a declared Nitro mount, so label:tr writes would be lost on restart. Land the fs mount before seeding live.';
    summary.elapsedMs = Date.now() - startedAt;
    logger.error?.(summary.aborted);
    return summary;
  }

  if (!dryRun) {
    try {
      await getCachedFn([DB_PROBE_TEXT], 'en', 'en');
    } catch (error) {
      summary.aborted = `db-reachability-probe failed before any write: ${error?.message ?? error}`;
      summary.elapsedMs = Date.now() - startedAt;
      logger.error?.(summary.aborted);
      return summary;
    }
  }

  const files = (await readDir(localesDir))
    .filter(f => f.endsWith('.json') && !NON_LOCALE_FILES.has(f))
    .sort();

  for (const file of files) {
    const locale = file.replace(/\.json$/, '');
    let localeJson;
    try {
      localeJson = await readJson(path.join(localesDir, file));
    } catch (error) {
      summary.unparseableFiles.push({ file, reason: error?.message ?? String(error) });
      logger.warn?.(`skipping unparseable locale file ${file}: ${error?.message ?? error}`);
      continue;
    }

    const { pairs, skippedMissing } = buildSeedPairs(labels, localeJson);
    const { safe, collisions, deduped, withheld } = detectLabelCollisions(pairs);

    for (const collision of collisions) {
      summary.collisions.push({ locale, kind: 'shared-english-label', ...collision });
    }

    let writable = safe;
    let skippedExistingConflict = 0;

    if (!dryRun) {
      const existing = await getCachedFn(safe.map(p => p.englishLabel), locale, 'en');
      const kept = [];
      for (const pair of safe) {
        const current = existing?.get?.(cacheKeyFn(pair.englishLabel));
        if (current !== undefined && current !== null && current !== pair.localeLabel) {
          summary.collisions.push({
            locale,
            kind: 'existing-row-conflict',
            englishLabel: pair.englishLabel,
            identifiers: [pair.identifier],
            values: [current, pair.localeLabel]
          });
          skippedExistingConflict += 1;
          continue;
        }
        kept.push(pair);
      }
      writable = kept;
    }

    let dbRowsWritten = 0;
    let storageEntriesWritten = 0;

    if (!dryRun && writable.length) {
      await saveFn(buildDbRows(writable, cacheKeyFn), locale, 'en');
      dbRowsWritten = writable.length;

      const entries = buildStorageEntries(writable, locale, now);
      for (let i = 0; i < entries.length; i += STORAGE_CHUNK_SIZE) {
        const chunk = entries.slice(i, i + STORAGE_CHUNK_SIZE);
        await Promise.all(chunk.map(({ key, entry }) => storage.setItem(key, entry)));
        storageEntriesWritten += chunk.length;
      }
    }

    summary.locales.push({
      locale,
      candidates: pairs.length,
      wouldWrite: writable.length,
      dbRowsWritten,
      storageEntriesWritten,
      skippedMissing,
      dedupedSharedLabel: deduped,
      withheldCollision: withheld,
      skippedExistingConflict
    });

    summary.totals.candidates += pairs.length;
    summary.totals.wouldWrite += writable.length;
    summary.totals.dbRowsWritten += dbRowsWritten;
    summary.totals.storageEntriesWritten += storageEntriesWritten;
    summary.totals.skippedMissing += skippedMissing;
    summary.totals.dedupedSharedLabel += deduped;
    summary.totals.withheldCollision += withheld;
    summary.totals.skippedExistingConflict += skippedExistingConflict;
  }

  summary.elapsedMs = Date.now() - startedAt;
  logger.info?.(
    `[i18n:seed-translation-cache] ${summary.mode}: ${summary.identifierCount} identifiers, ` +
    `${summary.locales.length} locales, ${summary.totals.wouldWrite} pairs, ` +
    `${summary.collisions.length} collisions, ${summary.elapsedMs}ms`
  );

  return summary;
}
