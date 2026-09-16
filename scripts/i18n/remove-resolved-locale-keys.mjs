#!/usr/bin/env node
/**
 * Remove `p02-05`'s manifest-proven-safe keys from every `i18n/locales/*.json` file, and produce the
 * committed rollback archive `p02-07`'s `NUXT_THESAURUS_LABEL_SOURCE=snapshot` flag reads.
 *
 * ## The deletion gate is `safeToDelete`, not `resolvable` (corrected against the task file)
 *
 * The manifest's own `summary.readThisFirst` says it plainly: `resolvable` only means the CBD
 * Thesaurus API returned a term for that identifier; 51 of those 545 keys resolve to a DIFFERENT
 * English label than `en.json` renders today. Deleting on `resolvable` would silently change visible
 * text for those 51 keys, in every locale that carries them, while every existing test kept passing
 * (the identifier genuinely resolves — it just resolves to the wrong string). This script consumes
 * `records[].safeToDelete` (494 of 680 block keys) and nothing else. It never re-derives, pattern
 * matches, or regex-scans for candidate keys — that is exactly the trap that would delete `"or"`
 * (`en.json:954`, the English conjunction, which matches the ISO-2 shape `^[a-z]{2}$`) from all 82
 * files. `"or"` is `safeToDelete: false` in the manifest (verified) and this script has no code path
 * that could touch it regardless.
 *
 * ## Archive contract: reconciled against `p02-07`'s REAL implementation, not the task file's guess
 *
 * The task file proposed `server/assets/i18n-snapshot/<locale>.json`, one file per locale. That shape
 * does not exist: `p02-07` (already merged onto this branch) ships
 * `server/utils/thesaurus/snapshot-source.ts`, which reads exactly ONE asset,
 * `thesaurus-label-snapshot.json` (mounted from `server/assets/`), shaped
 * `Record<identifier, Record<locale, string>>`. This script writes THAT contract — the one the
 * consumer actually reads — not the task file's proposal. Diverging from the task file here is
 * required, not optional: writing the proposed shape would leave `resolveFromSnapshot` reading an
 * asset key that is never produced, i.e. a rollback flag that silently does nothing.
 *
 * ## Archive safety: staged, verified, then atomically promoted (never blindly overwritten)
 *
 * The archive is the ONLY rollback artifact (D12) — a crash-then-retry run must never destroy it.
 * Every live run:
 *
 * 1. Builds the archive fragment for THIS run's planned removals from the locale files'
 *    still-pre-deletion values (never from anything already deleted).
 * 2. Merges it with whatever canonical archive already exists on disk (a prior successful run), so a
 *    resumed run accumulates rather than replaces.
 * 3. Writes the merged result to a NEW timestamped staging file under `.agents/temp/` (gitignored,
 *    outside both the working tree being mutated and the canonical archive path).
 * 4. Reads the staging file back and deep-compares it against the in-memory merged data — a parse
 *    failure or mismatch aborts before any locale file is touched.
 * 5. Only then atomically promotes the verified content onto the canonical path (write-temp +
 *    rename in the same directory, so a crash mid-promote never leaves a half-written canonical
 *    file).
 *
 * Deletions happen only after step 5 succeeds. Idempotency falls out of check-before-delete
 * (Step {@link planRemovals}): a second run finds the manifest's keys already absent everywhere they
 * were removed, plans zero further removals, and — per the "no removals, nothing to archive" branch
 * in {@link run} — never re-touches the canonical archive at all.
 *
 * ## `.DS_Store` and the 79-vs-82 registry mismatch
 *
 * Both are reported, in every run (dry-run or live), never acted on silently. `.DS_Store` is deleted
 * in a live run ONLY when `--confirm-ds-store` is passed on that exact invocation; the registry
 * mismatch (`no.json`, `ps.json`, `ur.json` on disk but not in `i18n/locales.js`) is named explicitly
 * and left entirely alone — reconciling it is the user's call.
 *
 * Usage:
 *   node scripts/i18n/remove-resolved-locale-keys.mjs                    # dry run (default, zero writes)
 *   node scripts/i18n/remove-resolved-locale-keys.mjs --live             # perform the deletion + archive
 *   node scripts/i18n/remove-resolved-locale-keys.mjs --live --confirm-ds-store   # also remove .DS_Store
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

export const LOCALE_DIR = path.join(REPO_ROOT, 'i18n/locales');
export const MANIFEST_PATH = path.join(REPO_ROOT, 'server/assets/thesaurus-resolvability-manifest.json');
export const CANONICAL_ARCHIVE_PATH = path.join(REPO_ROOT, 'server/assets/thesaurus-label-snapshot.json');
export const STAGING_DIR = path.join(REPO_ROOT, '.agents/temp/i18n-snapshot-staging');
const REGISTRY_PATH = path.join(REPO_ROOT, 'i18n/locales.js');

/** The 3 on-disk locale files known (verified during this phase's drafting) not to be registered. */
export const KNOWN_UNREGISTERED_LOCALES = ['no', 'ps', 'ur'];

/** Every `records[].identifier` the manifest marks `safeToDelete`. This is the *only* deletion input. */
export function loadSafeToDeleteIdentifiers(manifest) {
  return new Set((manifest?.records ?? []).filter((record) => record?.safeToDelete === true).map((record) => record.identifier));
}

/**
 * Split a `fs.readdir` listing of `i18n/locales/` into locale codes (`.json` files, extension
 * stripped) and everything else (the stray `.DS_Store`, or any future non-JSON entry). Never acts on
 * the stray entries — that is the caller's job, gated by explicit confirmation.
 */
export function listLocaleEntries(dirEntries) {
  const localeFiles = [];
  const strayFiles = [];
  for (const name of dirEntries) {
    if (name.toLowerCase().endsWith('.json')) localeFiles.push(name.replace(/\.json$/i, ''));
    else strayFiles.push(name);
  }
  localeFiles.sort();
  strayFiles.sort();
  return { localeFiles, strayFiles };
}

/**
 * Report — never resolve — the 79-vs-82 registry mismatch. Named filenames, not just a count, per the
 * task's Step 3 requirement.
 */
export function registryMismatchReport(registryCodes, localeFiles) {
  const registered = new Set(registryCodes);
  return {
    registeredLocaleCount: registered.size,
    localeFileCount: localeFiles.length,
    onDiskButNotRegistered: localeFiles.filter((code) => !registered.has(code)).sort(),
    note: 'Reported only. Reconciling the 79-vs-82 mismatch is the user call (index.md, Manual Prerequisites item 5).'
  };
}

/**
 * Per-locale, check-before-delete removal plan. Never assumes a key is present — every one of the 81
 * non-`en` files diverges from `en.json` (some, like `no`/`ps`, are missing nearly the whole block),
 * so a plan entry legitimately has zero removals for many locales.
 *
 * @param localeFiles - locale codes (no extension), as returned by {@link listLocaleEntries}.
 * @param readLocale  - `(code) => object` — injected so this stays pure/testable.
 * @param safeSet     - the manifest's `safeToDelete` identifier set.
 * @returns one entry per locale: `{ locale, removed: [{identifier, value}], data }`. `data` is the
 *          parsed (not yet mutated) locale object, returned so the caller can build the archive
 *          fragment and, later, the mutated file, from a single parse.
 */
export function planRemovals(localeFiles, readLocale, safeSet) {
  return localeFiles.map((locale) => {
    const data = readLocale(locale);
    const removed = [];
    for (const identifier of safeSet) {
      if (Object.prototype.hasOwnProperty.call(data, identifier)) {
        removed.push({ identifier, value: data[identifier] });
      }
    }
    return { locale, removed, data };
  });
}

/** Total keys the plan would remove, across every locale. */
export const totalPlannedRemovals = (plan) => plan.reduce((sum, entry) => sum + entry.removed.length, 0);

/**
 * Build this run's archive fragment — `Record<identifier, Record<locale, string>>` — from the plan's
 * PRE-deletion values only. Only string values are archived (every locale value observed in this
 * repo is a string; a non-string would indicate a malformed locale file, not a label to roll back).
 */
export function buildArchiveFragment(plan) {
  const fragment = {};
  for (const { locale, removed } of plan) {
    for (const { identifier, value } of removed) {
      if (typeof value !== 'string') continue;
      (fragment[identifier] ??= {})[locale] = value;
    }
  }
  return fragment;
}

/**
 * Merge an incoming archive fragment into a base (possibly empty) canonical archive. A value already
 * present in `base` is NEVER overwritten — a resumed run's fragment can only ADD entries for
 * identifier/locale pairs the base doesn't already have, so a crash between "archive promoted" and
 * "locale files written" can never lose or corrupt an already-captured original value.
 */
export function mergeArchives(base, incoming) {
  const merged = structuredClone(base ?? {});
  for (const [identifier, byLocale] of Object.entries(incoming)) {
    merged[identifier] ??= {};
    for (const [locale, value] of Object.entries(byLocale)) {
      if (!(locale in merged[identifier])) merged[identifier][locale] = value;
    }
  }
  return merged;
}

/** Recursively sort object keys so two structurally-equal-but-differently-ordered objects compare equal. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

/** True when two archive objects are deeply equal regardless of key order. */
export function archivesEqual(a, b) {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/** An ISO-8601 timestamp safe to use as a filename on every OS this repo runs on (no `:`). */
export function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Stage the merged archive at a NEW timestamped path (never overwritten on a retry — see the module
 * header's Move-4 rationale), read it back, and verify it round-trips byte-for-byte-equivalent
 * (order-insensitive) before returning its path. Throws on any parse or mismatch failure; the caller
 * must treat that as an abort-before-delete condition.
 *
 * @param {Record<string, Record<string, string>>} mergedArchive
 * @param {{ writeFile: (file: string, content: string) => void, readFile: (file: string) => string,
 *   mkdir: (dir: string) => void, stagingDir?: string }} io
 */
export function stageAndVerifyArchive(mergedArchive, { writeFile, readFile, mkdir, stagingDir = STAGING_DIR } = {}) {
  mkdir(stagingDir);
  const stagingPath = path.join(stagingDir, `${timestampForFilename()}.json`);
  const serialized = `${JSON.stringify(mergedArchive, null, 2)}\n`;
  writeFile(stagingPath, serialized);

  const roundTripped = JSON.parse(readFile(stagingPath));
  if (!archivesEqual(roundTripped, mergedArchive)) {
    throw new Error(`Archive round-trip verification failed for staging file ${stagingPath} — refusing to delete anything.`);
  }
  return { stagingPath, serialized };
}

/**
 * Atomically promote a verified, already-serialized archive onto the canonical path the D12 rollback
 * flag reads: write to a temp file in the SAME directory as the canonical path, then rename over it.
 * A crash mid-promote leaves either the old canonical file intact or the new one fully written — never
 * a half-written file.
 *
 * @param {string} serialized
 * @param {{ writeFile: (file: string, content: string) => void, rename: (from: string, to: string) => void,
 *   canonicalPath?: string }} io
 */
export function promoteArchive(serialized, { writeFile, rename, canonicalPath = CANONICAL_ARCHIVE_PATH } = {}) {
  const tempPath = `${canonicalPath}.tmp-${process.pid}-${Date.now()}`;
  writeFile(tempPath, serialized);
  rename(tempPath, canonicalPath);
}

/** Apply a plan entry's removals to its already-parsed data, in place, and return it. */
export function applyRemovals(planEntry) {
  for (const { identifier } of planEntry.removed) delete planEntry.data[identifier];
  return planEntry.data;
}

/** Serialize a locale object the same way every locale file in this repo is formatted: 2-space indent, trailing newline. */
export const serializeLocale = (data) => `${JSON.stringify(data, null, 2)}\n`;

/**
 * The grep argv for the literal-usage verification step (task Step 10, first check). Exported as pure
 * data so it is testable without spawning a process; {@link main} is the only caller that actually
 * runs it.
 */
export function buildLiteralUsageGrepArgs(identifiers, repoRoot = REPO_ROOT) {
  return [
    '-rl',
    '-F',
    ...identifiers.flatMap((identifier) => ['-e', identifier]),
    '--exclude-dir=node_modules',
    '--exclude-dir=.git',
    '--exclude-dir=i18n',
    '--exclude-dir=.agents',
    repoRoot
  ];
}

/** Parse `grep -l`'s newline-separated file list into a clean array (handles the "no matches" empty case). */
export function parseGrepHits(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The whole run, every I/O edge injected (mirrors `scripts/thesaurus/classify-resolvable-keys.mjs`'s
 * shape) so orchestration itself is covered rather than excluded from the denominator.
 *
 * @param io   - `{ readJson, readDirEntries, readRegistryCodes, existsSync, writeFile, readFile, mkdir,
 *               rename, removeFile, log }`.
 * @param opts - `{ live: boolean, confirmDsStore: boolean }`. `live` defaults to `false` (dry run).
 */
export async function run(io, { live = false, confirmDsStore = false } = {}) {
  const { readJson, readDirEntries, readRegistryCodes, existsSync: fileExists, writeFile, readFile, mkdir, rename, removeFile, log } = io;

  const manifest = readJson(MANIFEST_PATH);
  const safeSet = loadSafeToDeleteIdentifiers(manifest);

  const dirEntries = readDirEntries(LOCALE_DIR);
  const { localeFiles, strayFiles } = listLocaleEntries(dirEntries);
  const registryCodes = await readRegistryCodes();
  const registryReport = registryMismatchReport(registryCodes, localeFiles);

  const plan = planRemovals(localeFiles, (code) => readJson(path.join(LOCALE_DIR, `${code}.json`)), safeSet);
  const totalRemovals = totalPlannedRemovals(plan);

  const report = {
    live,
    safeToDeleteKeyCount: safeSet.size,
    perLocale: plan.map(({ locale, removed }) => ({ locale, removed: removed.length })),
    totalRemovals,
    strayFiles,
    dsStore: {
      present: strayFiles.includes('.DS_Store'),
      removed: false
    },
    registryMismatch: registryReport
  };

  log(`safeToDelete keys in manifest: ${safeSet.size}`);
  log(`Locale files on disk: ${localeFiles.length} (registry has ${registryReport.registeredLocaleCount})`);
  if (registryReport.onDiskButNotRegistered.length > 0) {
    log(`Unregistered locale files: ${registryReport.onDiskButNotRegistered.join(', ')}`);
  }
  if (strayFiles.length > 0) log(`Stray non-JSON entries in i18n/locales/: ${strayFiles.join(', ')}`);
  log(`Planned removals: ${totalRemovals} across ${plan.filter((p) => p.removed.length > 0).length} of ${plan.length} locale files.`);

  if (!live) {
    log('Dry run — no files written.');
    return report;
  }

  if (totalRemovals === 0) {
    log('Live run: zero keys present to remove (idempotent no-op). Archive untouched.');
    return report;
  }

  // Archive first — verified — before any locale file is touched.
  const existingArchive = fileExists(CANONICAL_ARCHIVE_PATH) ? readJson(CANONICAL_ARCHIVE_PATH) : {};
  const fragment = buildArchiveFragment(plan);
  const merged = mergeArchives(existingArchive, fragment);
  const { serialized } = stageAndVerifyArchive(merged, { writeFile, readFile, mkdir });
  promoteArchive(serialized, { writeFile, rename });
  log(`Archive verified and promoted to ${CANONICAL_ARCHIVE_PATH}.`);

  // Only now, delete.
  for (const entry of plan) {
    if (entry.removed.length === 0) continue;
    const mutated = applyRemovals(entry);
    writeFile(path.join(LOCALE_DIR, `${entry.locale}.json`), serializeLocale(mutated));
  }
  log(`Removed ${totalRemovals} keys across ${plan.filter((p) => p.removed.length > 0).length} locale files.`);

  if (report.dsStore.present) {
    if (confirmDsStore) {
      removeFile(path.join(LOCALE_DIR, '.DS_Store'));
      report.dsStore.removed = true;
      log('.DS_Store removed (explicitly confirmed for this run).');
    } else {
      log('.DS_Store present but NOT removed — pass --confirm-ds-store to this specific run to remove it.');
    }
  }

  return report;
}

/**
 * The real-filesystem `io` object `main()` passes to {@link run}. Exported (unlike `main` itself) so
 * a unit test can exercise the actual `node:fs` wiring against a real temp directory instead of
 * excluding it from coverage wholesale.
 */
export function createRealIo() {
  return {
    readJson: (file) => JSON.parse(readFileSync(file, 'utf8')),
    readDirEntries: (dir) => readdirSync(dir),
    readRegistryCodes: async () => (await import(path.join(REPO_ROOT, 'i18n/locales.js'))).default.map((entry) => entry.code),
    existsSync: (file) => existsSync(file),
    writeFile: (file, content) => writeFileSync(file, content, 'utf8'),
    readFile: (file) => readFileSync(file, 'utf8'),
    mkdir: (dir) => mkdirSync(dir, { recursive: true }),
    rename: (from, to) => renameSync(from, to),
    removeFile: (file) => rmSync(file, { force: true }),
    log: (message) => console.log(message)
  };
}

// Real-world wiring. Nothing below branches; every decision lives in the exported functions above.
/* v8 ignore start */

const main = async () => {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const confirmDsStore = args.includes('--confirm-ds-store');
  await run(createRealIo(), { live, confirmDsStore });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

/* v8 ignore stop */
