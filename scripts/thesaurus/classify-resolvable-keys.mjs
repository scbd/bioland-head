#!/usr/bin/env node
/**
 * Classify every key in `i18n/locales/en.json`'s taxonomy block as resolvable or not, and emit
 * `server/assets/thesaurus-resolvability-manifest.json`.
 *
 * ## Why this exists (D1 — the deletion gate, quoted verbatim)
 *
 * > "Resolution is the deletion gate. Probe every key in the block; **resolvable -> in scope,
 * > unresolvable -> left in place** for a manual review pass by the user afterward. Not every key
 * > past index 380 is a thesaurus term."
 *
 * This script only CLASSIFIES. It deletes nothing. `p03-05` is the eventual consumer that removes
 * keys from the 82 locale files, and the user performs a manual review pass over the remainder.
 *
 * ## The two error directions are not symmetric
 *
 * A key wrongly marked resolvable is a label that silently disappears from production. A key
 * wrongly marked unresolvable merely stays put and reaches the user's manual pass. Every judgement
 * call in here is therefore biased toward "unresolvable" / "not safe to delete".
 *
 * That asymmetry is why the manifest carries TWO booleans, not one:
 *
 * - `resolvable` — D1 as literally written: the canonical identifier returned HTTP 200 with a
 *   non-empty multilingual `title` object. This is a statement about the API, nothing more.
 * - `safeToDelete` — the gate `p03-05` must actually consume: `resolvable` AND the resolved
 *   English label is byte-identical to the value sitting in `en.json` today. A key that resolves
 *   to a DIFFERENT string is a silent label change, not a safe deletion (see `reviewFlags`).
 *
 * 51 of the 545 resolvable keys are label-divergent, so the two counts differ materially. Reading
 * `resolvable` as if it meant `safeToDelete` would regress 51 production labels.
 *
 * ## Block boundary (verified against the live file, not assumed)
 *
 * Ordered-key indices `[380, 1059]` inclusive — 680 keys. Index 380 is the first GUID key; 1059 is
 * the last key before the trailing UI tail. Shared verbatim with
 * `scripts/thesaurus/build-iso2-country-map.mjs`, which carries the same two constants.
 *
 * The block is NOT contiguous. A 70-key UI-chrome gap sits at indices `[932, 1001]` — PDF/EBV/GEO
 * BON widget copy, an embedded Jira-roadmap vocabulary, and section headings. Those keys are
 * classified unresolvable WITHOUT any live probe: they are interface text, not thesaurus terms, so
 * probing them only risks an accidental false-positive match against an unrelated CBD term.
 *
 * ⚠ The plan text states this gap as `[933, 1004]`. That is wrong in both directions and is
 * corrected here against the live file: index 932 is `pdfNotice` (the first widget key), and
 * indices 1002-1004 are real GUID terms that MUST be probed. {@link assertBlockIntegrity} pins the
 * corrected boundary to its four neighbouring key names and throws if `en.json` ever shifts under
 * it, so the range can never drift silently.
 *
 * ## Bulk enumeration, not 680 probes (D16)
 *
 * `{base}/domains/{domain}/terms` returns every term in a domain with its full `title` /
 * `shortTitle` objects, so 14 domain requests replace 680 per-identifier probes. Only keys that
 * MISS that corpus fall through to a single `{base}/terms/{id}` probe — 68 of them on the recorded
 * run. Total: **82 requests** (14 domain + 68 tail).
 *
 * Because the tail exceeds the ~50-key threshold the task sets for resumability, tail probes are
 * paced at {@link TAIL_DELAY_MS} and checkpointed to {@link PROGRESS_PATH} (under the gitignored
 * `.agents/temp/`, never committed) after every probe. An interrupted run resumes from the last
 * completed identifier instead of re-probing. Delete that file to force a clean re-probe.
 *
 * ## Reproducibility
 *
 * The manifest carries NO timestamp and no run metadata. Records are emitted in block-index order
 * and every derived list is sorted, so re-running against an unchanged `en.json` and an unchanged
 * API produces a byte-identical file.
 *
 * ## Why `server/assets/`
 *
 * The plan's research scripts live in an off-repo `temp/` scratch directory. The manifest is not
 * scratch: `p03-05` and the user's manual review pass both depend on it, so it belongs in the repo.
 * `server/assets/` is the one existing precedent for a committed non-code data file
 * (`server/assets/schema.sql`), and it is the same directory the two alias maps already use.
 *
 * Usage: `node scripts/thesaurus/classify-resolvable-keys.mjs`
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const LOCALE_DIR = path.join(REPO_ROOT, 'i18n/locales');
const EN_LOCALE = path.join(LOCALE_DIR, 'en.json');
const SDG_ALIASES = path.join(REPO_ROOT, 'server/assets/thesaurus-aliases/sdg.json');
const ISO2_ALIASES = path.join(REPO_ROOT, 'server/assets/thesaurus-aliases/iso2-countries.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'server/assets/thesaurus-resolvability-manifest.json');
const PROGRESS_PATH = path.join(REPO_ROOT, '.agents/temp/thesaurus-classify-progress.json');

const THESAURUS_BASE = 'https://api.cbd.int/api/v2013/thesaurus';
const TAIL_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 30_000;
/** Guard against a runaway or hostile response body. */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Block boundary, ordered-key indices, inclusive. Mirrors `build-iso2-country-map.mjs`. */
export const BLOCK_START = 380;
export const BLOCK_END = 1059;

/** UI-chrome gap inside the block. Corrected from the plan's `[933, 1004]` — see header. */
export const GAP_START = 932;
export const GAP_END = 1001;

/**
 * The exact keys bounding the gap. {@link assertBlockIntegrity} pins the numeric range to these so
 * an edit to `en.json` fails the run loudly instead of shifting the gap onto real taxonomy keys.
 */
const GAP_ANCHORS = {
  beforeStart: 'GBF-GOAL-DDescription',
  start: 'pdfNotice',
  end: 'National Biosafety Framework',
  afterEnd: 'B18CE475-8D23-4DEC-A9F1-13F0243C9233'
};

/** The 14 CBD Thesaurus domains enumerated in bulk. Keyed by `dataSourceConfigs`' own domain names. */
export const BULK_DOMAINS = {
  regions: 'regions',
  countries: 'countries',
  orgTypes: 'Organization%20Types',
  aichis: 'AICHI-TARGETS',
  subjects: 'CBD-SUBJECTS',
  jurisdictions: '50AC1489-92B8-4D99-965A-AAE97A80F38E',
  geoScopes: '4D4413D8-36F9-4CD2-8CC1-4F3C866DDE5A',
  projectStatuses: '4E7731C7-791E-46E9-A579-7272AF261FED',
  documentTypes: 'A762DF7E-B8D1-40D6-9DAC-D25E48C65528',
  gbfTargets: 'GBF-TARGETS',
  gbfGoals: 'GBF-GOALS',
  eventStatuses: 'NCHM-EVENT-STATUS',
  bchSubjects: '043C7F0D-2226-4E54-A56F-EE0B74CCC984',
  // Not `sdgs` — `config.ts`'s `sdgs` entry points at the external UN SDG API. The CBD Thesaurus
  // domain that actually holds the SDG terms the aliases map onto is this one (see p02-03).
  sustainableDevelopmentGoals: 'SUSTAINABLE-DEVELOPMENT-GOALS'
};

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO2 = /^[a-z]{2}$/;
const CBD_SUBJECT = /^CBD-SUBJECT-/;
const GBF_TARGET = /^GBF-TARGET-/;
const AICHI_TARGET = /^AICHI-TARGET-/;
const SDG = /^SDG-GOAL-/;
const DOC_N = /^doc-\d+$/;

/**
 * Bucket a key into its consumer family. Order matters: the specific prefixes are tested before
 * {@link ISO2}, which is a two-letter catch-all.
 */
export function bucketOf(key) {
  if (GUID.test(key)) return 'guid';
  if (CBD_SUBJECT.test(key)) return 'cbd-subject';
  if (GBF_TARGET.test(key)) return 'gbf-target';
  if (AICHI_TARGET.test(key)) return 'aichi-target';
  if (SDG.test(key)) return 'sdg';
  if (DOC_N.test(key)) return 'doc-n';
  if (ISO2.test(key)) return 'iso2';
  return 'other';
}

/** True when an absolute ordered-key index falls inside the UI-chrome gap. */
export const isInUiGap = (index) => index >= GAP_START && index <= GAP_END;

/** The 680 block keys, paired with their absolute ordered-key index. */
export function getBlockKeys(localeData) {
  return Object.keys(localeData)
    .slice(BLOCK_START, BLOCK_END + 1)
    .map((key, offset) => ({ key, index: BLOCK_START + offset }));
}

/**
 * Fail loudly if `en.json` has shifted under the hardcoded boundaries. Cheap insurance against the
 * single worst failure mode here: a silently mis-aligned gap that marks real terms as UI chrome, or
 * lets UI chrome be probed against the live API.
 */
export function assertBlockIntegrity(localeData) {
  const keys = Object.keys(localeData);
  const block = keys.slice(BLOCK_START, BLOCK_END + 1);

  if (block.length !== 680) {
    throw new Error(`Block boundary drifted: expected 680 keys at [${BLOCK_START}, ${BLOCK_END}], got ${block.length}.`);
  }
  if (!GUID.test(keys[BLOCK_START])) {
    throw new Error(`Block start drifted: index ${BLOCK_START} is ${JSON.stringify(keys[BLOCK_START])}, expected a GUID.`);
  }
  const anchors = [
    [GAP_START - 1, GAP_ANCHORS.beforeStart],
    [GAP_START, GAP_ANCHORS.start],
    [GAP_END, GAP_ANCHORS.end],
    [GAP_END + 1, GAP_ANCHORS.afterEnd]
  ];
  for (const [index, expected] of anchors) {
    if (keys[index] !== expected) {
      throw new Error(
        `UI-gap anchor drifted: index ${index} is ${JSON.stringify(keys[index])}, expected ${JSON.stringify(expected)}. ` +
          `Re-derive GAP_START/GAP_END against i18n/locales/en.json before trusting this manifest.`
      );
    }
  }
}

/**
 * Map a locale key onto the identifier the API actually knows, via the two committed alias maps.
 * `_unmapped` is a reporting key inside those files, never an alias — it is ignored explicitly.
 */
export function applyAliases(key, aliases) {
  const { sdg = {}, iso2 = {} } = aliases;
  const mapped = key === '_unmapped' ? undefined : (sdg[key] ?? iso2[key]);
  return typeof mapped === 'string' ? mapped : key;
}

/** Every locale filename (without extension), sorted. Ignores `.DS_Store` and any other non-JSON. */
export function listLocaleFiles(dirEntries) {
  return dirEntries
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .map((name) => name.replace(/\.json$/i, ''))
    .sort();
}

/**
 * `{ [localeCode]: Set<key> }` for every locale file, so key presence is a single in-memory lookup
 * rather than a re-read per key.
 */
export function buildLocaleIndex(localeFiles, readLocale) {
  return Object.fromEntries(localeFiles.map((code) => [code, new Set(Object.keys(readLocale(code)))]));
}

/** Locale codes whose file does NOT carry this key, sorted. */
export function localesMissingKey(key, localeIndex) {
  return Object.keys(localeIndex)
    .filter((code) => !localeIndex[code].has(key))
    .sort();
}

/**
 * The 79-registry-vs-82-files discrepancy, reported with exact filenames. Deliberately NOT fixed
 * here — reconciliation is the user's call.
 */
export function localeRegistryReport(registryCodes, localeFiles, strayFiles) {
  const registered = new Set(registryCodes);
  return {
    registeredLocales: registered.size,
    localeJsonFilesOnDisk: localeFiles.length,
    onDiskButNotRegistered: localeFiles.filter((code) => !registered.has(code)).sort(),
    registeredButNoFileOnDisk: [...registered].filter((code) => !localeFiles.includes(code)).sort(),
    strayNonJsonFiles: [...strayFiles].sort(),
    note: 'Reported, not fixed. Reconciliation is the user call (index.md, Manual Prerequisites item 5).'
  };
}

/** Per-locale key-set divergence from `en.json`, grouped by how many `en` keys each file is missing. */
export function divergenceReport(localeIndex) {
  const enKeys = [...(localeIndex.en ?? new Set())];
  const groups = {};
  for (const code of Object.keys(localeIndex).sort()) {
    if (code === 'en') continue;
    const present = localeIndex[code];
    const missing = enKeys.filter((key) => !present.has(key)).length;
    (groups[missing] ??= []).push(code);
  }
  return {
    comparedAgainst: 'en',
    enKeyCount: enKeys.length,
    localesIdenticalToEn: (groups[0] ?? []).length,
    missingKeyGroups: Object.keys(groups)
      .map(Number)
      .sort((a, b) => b - a)
      .map((missingKeyCount) => ({ missingKeyCount, localeCount: groups[missingKeyCount].length, locales: groups[missingKeyCount] }))
  };
}

/**
 * Pick the English label the resolver would actually render, in D17's default preference order
 * (`shortTitle` -> `title` -> `name`), plus every candidate, so a divergence can be read without
 * re-querying the API.
 */
export function englishLabelCandidates(term) {
  return [term?.shortTitle?.en, term?.title?.en, typeof term?.name === 'string' ? term.name : null]
    .filter((value) => typeof value === 'string' && value.trim() !== '');
}

/**
 * Build one manifest record. `resolution` is `null` for an unprobed or unresolved key, otherwise
 * `{ httpStatus, domain, method, term }`.
 */
export function buildRecord({ key, index, enValue, canonicalId, resolution, localeIndex, localeFileCount }) {
  const consumerFamily = bucketOf(key);
  const inUiGap = isInUiGap(index);
  const titleLanguages = Object.keys(resolution?.term?.title ?? {}).sort();
  const resolvable = Boolean(resolution && resolution.httpStatus === 200 && titleLanguages.length > 0);

  const candidates = resolvable ? englishLabelCandidates(resolution.term) : [];
  const resolvedLabelEn = candidates[0] ?? null;
  const labelMatchesEn = resolvable && candidates.some((value) => value.trim() === String(enValue).trim());

  const reviewFlags = [];
  if (inUiGap) reviewFlags.push('ui-chrome-gap-not-probed');
  if (resolvable && !labelMatchesEn) reviewFlags.push('label-would-change-on-delete');
  if (resolvable && canonicalId !== key) reviewFlags.push('resolved-via-alias');
  if (!resolvable && !inUiGap) reviewFlags.push('no-thesaurus-term');

  const missing = localesMissingKey(key, localeIndex);

  return {
    identifier: key,
    index,
    canonicalId,
    consumerFamily,
    inUiGap,
    resolvable,
    safeToDelete: resolvable && labelMatchesEn,
    resolutionMethod: resolution?.method ?? (inUiGap ? 'skipped-ui-gap' : 'none'),
    httpStatus: resolution?.httpStatus ?? null,
    domain: resolution?.domain ?? null,
    titleLanguages,
    enValue,
    resolvedLabelEn,
    labelMatchesEn,
    reviewFlags,
    // `localeFilesCarryingIt` is stored as its complement: the full file list lives once in
    // `summary.localeFiles`, and carrying it verbatim on all 680 records would add ~1 MB of
    // repetition to a file a human is meant to read. carrying = summary.localeFiles - this list.
    localeFilesMissingIt: missing,
    localeFileCountCarryingIt: localeFileCount - missing.length
  };
}

/** Roll the records up into the self-describing summary block. */
export function summarise(records, extras) {
  const tally = (predicate) => records.filter(predicate).length;
  const families = [...new Set(records.map((r) => r.consumerFamily))].sort();

  return {
    deletionGateRule:
      'D1: resolvable -> in scope for deletion by p03-05; unresolvable -> left in place for the user manual review pass.',
    readThisFirst:
      'Use `safeToDelete`, not `resolvable`, as the deletion gate. `resolvable` only means the API returned a term; ' +
      `${tally((r) => r.resolvable && !r.safeToDelete)} resolvable keys resolve to a DIFFERENT English label than en.json ` +
      'carries today, so deleting those would silently change rendered text.',
    blockStartIndex: BLOCK_START,
    blockEndIndex: BLOCK_END,
    totalKeys: records.length,
    resolvable: tally((r) => r.resolvable),
    unresolvable: tally((r) => !r.resolvable),
    safeToDelete: tally((r) => r.safeToDelete),
    needsHumanReview: tally((r) => !r.safeToDelete),
    uiChromeGap: {
      startIndex: GAP_START,
      endIndex: GAP_END,
      keyCount: tally((r) => r.inUiGap),
      note: 'Interface copy, never probed against the live API. Plan text said [933, 1004]; corrected here against en.json.'
    },
    byFamily: Object.fromEntries(
      families.map((family) => {
        const inFamily = records.filter((r) => r.consumerFamily === family);
        return [
          family,
          {
            total: inFamily.length,
            resolvable: inFamily.filter((r) => r.resolvable).length,
            unresolvable: inFamily.filter((r) => !r.resolvable).length,
            safeToDelete: inFamily.filter((r) => r.safeToDelete).length
          }
        ];
      })
    ),
    reviewGroups: Object.fromEntries(
      [...new Set(records.flatMap((r) => r.reviewFlags))].sort().map((flag) => {
        const flagged = records.filter((r) => r.reviewFlags.includes(flag));
        return [flag, { count: flagged.length, keys: flagged.map((r) => r.identifier) }];
      })
    ),
    ...extras
  };
}

/**
 * Probe the corpus-miss tail one identifier at a time, checkpointing after every probe so an
 * interrupted run resumes instead of re-probing. `probe`, `persist` and `pause` are injected so the
 * loop is testable without touching the network, the clock, or the disk.
 *
 * A thrown `probe` propagates deliberately: the caller's crash is what leaves the sidecar on disk,
 * and the already-probed identifiers in it are what the next run skips.
 */
export async function probeTail({ tail, progress, probe, persist, pause }) {
  const resolutions = new Map();
  let requests = 0;

  for (const { key, canonicalId } of tail) {
    let outcome = progress[canonicalId];
    if (!outcome) {
      await pause();
      outcome = await probe(canonicalId);
      requests += 1;
      progress[canonicalId] = outcome;
      await persist(progress);
    }
    resolutions.set(key, {
      httpStatus: outcome.httpStatus,
      domain: null,
      method: 'single-term-probe',
      term: outcome.httpStatus === 200 ? (outcome.term ?? null) : null
    });
  }

  return { resolutions, requests };
}

/**
 * Fold a domain listing into the corpus. Later domains never overwrite an identifier an earlier one
 * already claimed, so the corpus is deterministic in {@link BULK_DOMAINS} order.
 */
export function indexDomainTerms(corpus, domain, terms) {
  for (const term of terms) {
    const id = String(term?.identifier ?? '').toLowerCase();
    if (id && !corpus.has(id)) corpus.set(id, { domain, term });
  }
  return corpus;
}

/**
 * Step 4b — resolve every non-gap block key against the enumerated corpus, and collect the misses
 * that need a single-term probe. Gap keys are skipped outright: they are never probed.
 */
export function partitionAgainstCorpus(blockKeys, corpus, aliases) {
  const resolutions = new Map();
  const tail = [];
  for (const { key, index } of blockKeys) {
    if (isInUiGap(index)) continue;
    const canonicalId = applyAliases(key, aliases);
    const hit = corpus.get(canonicalId.toLowerCase());
    if (hit) resolutions.set(key, { httpStatus: 200, domain: hit.domain, method: 'domain-enumeration', term: hit.term });
    else tail.push({ key, canonicalId });
  }
  return { resolutions, tail };
}

/**
 * The manifest's own refusal to be trusted when something has gone wrong. Every check here guards a
 * way the classification could silently authorise deleting a live label.
 */
export function assertManifestSanity(records) {
  if (records.length !== 680) {
    throw new Error(`Sanity check failed: expected 680 records, got ${records.length}.`);
  }
  const or = records.find((record) => record.identifier === 'or');
  if (!or) {
    throw new Error('Sanity check failed: the known false-positive key "or" is no longer in the block.');
  }
  if (or.resolvable) {
    throw new Error('Sanity check failed: "or" classified resolvable. It is the English conjunction, not an ISO-2 code.');
  }
  const probedGapKeys = records.filter((record) => record.inUiGap && record.httpStatus !== null);
  if (probedGapKeys.length > 0) {
    throw new Error(`Sanity check failed: ${probedGapKeys.length} UI-gap keys were probed against the live API.`);
  }
  const unsafeButDivergent = records.filter((record) => record.safeToDelete && !record.labelMatchesEn);
  if (unsafeButDivergent.length > 0) {
    throw new Error(`Sanity check failed: ${unsafeButDivergent.length} label-divergent keys were marked safe to delete.`);
  }
  return records;
}

/** Assemble the finished manifest from already-fetched inputs. Pure — no network, no filesystem. */
export function buildManifest({ localeData, blockKeys, aliases, resolutions, localeFiles, localeIndex, registryCodes, strayFiles, requestCounts }) {
  const records = blockKeys.map(({ key, index }) =>
    buildRecord({
      key,
      index,
      enValue: localeData[key],
      canonicalId: isInUiGap(index) ? key : applyAliases(key, aliases),
      resolution: resolutions.get(key) ?? null,
      localeIndex,
      localeFileCount: localeFiles.length
    })
  );

  assertManifestSanity(records);

  const summary = summarise(records, {
    localeFiles,
    localeRegistry: localeRegistryReport(registryCodes, localeFiles, strayFiles),
    localeDivergence: divergenceReport(localeIndex),
    requestCounts,
    fieldNotes: {
      localeFilesMissingIt: 'Complement form. Files carrying a key = summary.localeFiles minus this list.',
      resolvable: 'HTTP 200 with a non-empty title object. Not a deletion authorisation on its own.',
      safeToDelete: 'resolvable AND the resolved English label is byte-identical to the en.json value. THIS is the deletion gate.'
    }
  });

  return { summary, records };
}

/**
 * Fetch every domain listing once and fold it into one corpus (D16: 14 requests, not 680).
 * `fetchJson` is injected so the enumeration loop — including its failure branch — is testable.
 */
export async function enumerateCorpus(fetchJson, log = () => {}) {
  const corpus = new Map();
  let domainRequests = 0;
  for (const [domain, segment] of Object.entries(BULK_DOMAINS)) {
    const { httpStatus, body } = await fetchJson(`${THESAURUS_BASE}/domains/${segment}/terms`);
    domainRequests += 1;
    if (httpStatus !== 200 || !Array.isArray(body)) {
      throw new Error(`Domain enumeration failed for ${domain} (${segment}): HTTP ${httpStatus}.`);
    }
    indexDomainTerms(corpus, domain, body);
    log(`  enumerated ${domain}: ${body.length} terms`);
  }
  return { corpus, domainRequests };
}

/**
 * The whole run, with every I/O edge injected. {@link main} supplies the real filesystem, the live
 * API and the console; the specs supply fakes, so the orchestration itself is covered rather than
 * excluded from the denominator.
 */
export async function runClassification(io) {
  const { readJson, readDirEntries, readRegistryCodes, fetchJson, readProgress, writeProgress, clearProgress, writeManifest, pause, log } = io;

  const localeData = readJson(EN_LOCALE);
  assertBlockIntegrity(localeData);

  const aliases = { sdg: readJson(SDG_ALIASES), iso2: readJson(ISO2_ALIASES) };

  const dirEntries = readDirEntries(LOCALE_DIR);
  const localeFiles = listLocaleFiles(dirEntries);
  const strayFiles = dirEntries.filter((name) => !name.toLowerCase().endsWith('.json'));
  const localeIndex = buildLocaleIndex(localeFiles, (code) => readJson(path.join(LOCALE_DIR, `${code}.json`)));
  const registryCodes = await readRegistryCodes();

  // Step 4a — bulk enumeration.
  const { corpus, domainRequests } = await enumerateCorpus(fetchJson, log);
  log(`Corpus: ${corpus.size} unique identifiers from ${domainRequests} domain requests.`);

  // Step 4b — resolve against the corpus; collect the misses for the tail.
  const blockKeys = getBlockKeys(localeData);
  const { resolutions, tail } = partitionAgainstCorpus(blockKeys, corpus, aliases);

  // Step 4c — single-term fallback for corpus misses only, paced and resumable.
  const progress = readProgress();
  log(`Tail: ${tail.length} corpus misses to probe individually (${Object.keys(progress).length} already cached).`);
  const { resolutions: tailResolutions, requests: tailRequests } = await probeTail({
    tail,
    progress,
    probe: async (canonicalId) => {
      const { httpStatus, body } = await fetchJson(`${THESAURUS_BASE}/terms/${encodeURIComponent(canonicalId)}`);
      return { httpStatus, term: httpStatus === 200 ? body : null };
    },
    persist: async (state) => writeProgress(state),
    pause
  });
  for (const [key, resolution] of tailResolutions) resolutions.set(key, resolution);

  const manifest = buildManifest({
    localeData,
    blockKeys,
    aliases,
    resolutions,
    localeFiles,
    localeIndex,
    registryCodes,
    strayFiles,
    requestCounts: { domainEnumerations: domainRequests, singleTermProbes: tailRequests, total: domainRequests + tailRequests }
  });

  writeManifest(manifest);
  clearProgress();

  const { summary } = manifest;
  log(`\nresolvable: ${summary.resolvable}   unresolvable: ${summary.unresolvable}`);
  log(`safeToDelete: ${summary.safeToDelete}   needsHumanReview: ${summary.needsHumanReview}`);
  log(`requests: ${summary.requestCounts.total} (${domainRequests} domain + ${tailRequests} term)`);
  log(`Wrote ${OUTPUT_PATH}`);

  return manifest;
}

/**
 * The live HTTP boundary. Exported so the specs can pin the URL it is called with and exercise the
 * non-OK and oversized-body branches without reaching the network.
 */
export const liveFetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) return { httpStatus: response.status, body: null };
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new Error(`Response from ${url} exceeded ${MAX_RESPONSE_BYTES} bytes; refusing to parse.`);
  }
  return { httpStatus: response.status, body: JSON.parse(body) };
};

// Real-world wiring. Nothing below branches; every decision lives in the exported functions above.
/* v8 ignore start */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = () =>
  runClassification({
    readJson: (file) => JSON.parse(readFileSync(file, 'utf8')),
    readDirEntries: (dir) => readdirSync(dir),
    readRegistryCodes: async () => (await import(path.join(REPO_ROOT, 'i18n/locales.js'))).default.map((entry) => entry.code),
    fetchJson: liveFetchJson,
    readProgress: () => {
      if (!existsSync(PROGRESS_PATH)) return {};
      try {
        return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
      } catch {
        console.warn('Progress sidecar was unreadable; starting the tail from scratch.');
        return {};
      }
    },
    writeProgress: (progress) => {
      mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
      writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
    },
    clearProgress: () => rmSync(PROGRESS_PATH, { force: true }),
    writeManifest: (manifest) => writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    pause: () => sleep(TAIL_DELAY_MS),
    log: (message) => console.log(message)
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

/* v8 ignore stop */
