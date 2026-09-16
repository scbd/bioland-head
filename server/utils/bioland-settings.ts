import { consola } from "consola";

/**
 * `bioland.settings` boundary filter (BL-890).
 *
 * dmsm hands the Drupal `bioland.settings` config row through WHOLE - its SQL is an exact match on
 * `name = 'bioland.settings'` and it assigns the object with no pick, omit, or key iteration. That
 * is dmsm's deliberate contract, so head owns the filtering. Everything a Drupal editor can write
 * into that row would otherwise reach the app verbatim as `siteStore.biolandSettings`, and since
 * BL-885 that bag drives rendering on every page.
 *
 * Two hazards are already proven, both triggerable from the CMS admin UI and both a total render
 * failure for the whole site:
 *   - `{ __proto__: ... }` / `{ constructor: ... }` at the top level
 *   - `{ mega_menu: { __proto__: ... } }` nested
 *
 * camelCasing is NOT a defence: `change-case` rewrites a top-level `__proto__` to `proto` but
 * leaves `constructor` verbatim, and it stops at depth 7.
 *
 * So this module applies THREE passes, before any camelCasing:
 *   1. An explicit top-level ALLOWLIST of the keys head actually consumes, matched case- and
 *      separator-insensitively and re-emitted under the allowlist's own canonical spelling. It
 *      fails closed - a new editor-authored key reaches no consumer until it is listed here - and
 *      it documents what head depends on.
 *   2. A depth-agnostic strip of `__proto__` / `constructor` / `prototype` inside the kept
 *      branches. Belt and braces on purpose: the allowlist only governs the top level, while the
 *      proven `mega_menu.__proto__` failure lives inside a key the allowlist must keep.
 *   3. A depth bound, so a pathological payload cannot blow the stack. Anything past the bound is
 *      dropped rather than passed through unfiltered, and the drop is logged.
 *
 * Consumer-side guards (for example the prototype-key guard in `app/utils/resolve-theme.js`) stay
 * where they are. Defence in depth is intentional.
 */

/** Keys `bioland.settings` may expose, with the consumer that justifies each one. */
export const BIOLAND_SETTINGS_ALLOWLIST = [
  /** app/stores/site.js -> app/utils/resolve-theme.js (site theme, every page since BL-885) */
  "theme",
  /** app/stores/site.js - `config.promoteAndStickyPublic` */
  "config",
  /** app/plugins/google-tags.client.ts - `googleAnalyticsEnabled`, the only GA switch (BL-1015) */
  "googleAnalyticsEnabled",
  /** app/plugins/google-tags.client.ts - `googleAnalyticsIds` */
  "googleAnalyticsIds",
  /** app/components/page/home-page-widget-selection.vue and the widget/* components */
  "homeWidgets",
  /** app/components/page/header/mega-menu/**, server/utils/drupal/drupal-content-types.js */
  "megaMenu",
] as const;

/** Keys that can poison an object graph, stripped at any depth. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Hostile input can nest arbitrarily deep. Bound the walk so a pathological payload cannot blow the
 * stack; anything past the bound is dropped rather than passed through unfiltered (fail closed).
 */
const MAX_DEPTH = 32;

/** How many distinct truncated paths to name in the warning before summarising by count alone. */
const MAX_REPORTED_PATHS = 5;

/** Case- and separator-insensitive key identity, so `mega_menu`, `mega-menu` and `megaMenu` match. */
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Normalized identity -> the allowlist's canonical spelling for it. */
const CANONICAL_KEYS = new Map<string, string>(
  BIOLAND_SETTINGS_ALLOWLIST.map((key) => [normalizeKey(key), key]),
);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Records branches dropped for exceeding `MAX_DEPTH`, so the truncation is never silent. */
interface TruncationLog {
  count: number;
  paths: string[];
}

/** Deep copy with every forbidden key removed, at any depth and regardless of authored casing. */
function stripForbiddenKeys(
  value: unknown,
  depth: number,
  path: string,
  truncation: TruncationLog,
): unknown {
  if (depth > MAX_DEPTH) {
    truncation.count += 1;

    if (truncation.paths.length < MAX_REPORTED_PATHS) truncation.paths.push(path);

    return undefined;
  }

  if (Array.isArray(value))
    return value.map((entry, index) =>
      stripForbiddenKeys(entry, depth + 1, `${path}[${index}]`, truncation),
    );

  if (!isPlainObject(value)) return value;

  const safe: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(normalizeKey(key))) continue;

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (!descriptor?.enumerable || !("value" in descriptor)) continue;

    safe[key] = stripForbiddenKeys(descriptor.value, depth + 1, `${path}.${key}`, truncation);
  }

  return safe;
}

/** Longest authored key text rendered into a log line, including the quotes `JSON.stringify` adds. */
const MAX_LOGGED_KEY_LENGTH = 80;

/**
 * Authored key text is attacker-controlled, so it is never interpolated raw into a log line: a key
 * may carry newlines, ANSI escapes or tens of kilobytes of padding. `JSON.stringify` escapes the
 * control characters and quotes the result; the length bound keeps one key from flooding the log.
 */
const forLog = (key: string): string => {
  const escaped = JSON.stringify(key);

  return escaped.length <= MAX_LOGGED_KEY_LENGTH
    ? escaped
    : `${escaped.slice(0, MAX_LOGGED_KEY_LENGTH)}..."`;
};

/**
 * How far an authored spelling sits from the canonical one, as `[case mismatches, separators]`.
 *
 * Every spelling in a collision shares the canonical key's normalized identity, so it can differ
 * only by letter casing and by inserted non-alphanumeric characters. Counting both is O(n) and
 * gives the canonical spelling - and only the canonical spelling - a score of `[0, 0]`.
 */
const spellingDeviation = (key: string, canonical: string): [number, number] => {
  const alphanumeric = key.replace(/[^A-Za-z0-9]/g, "");

  let caseMismatches = 0;

  for (let i = 0; i < canonical.length; i += 1)
    if (alphanumeric[i] !== canonical[i]) caseMismatches += 1;

  return [caseMismatches, key.length - alphanumeric.length];
};

/**
 * Deterministic precedence between two authored spellings of the SAME allowlisted key.
 *
 * Duplicate spellings are an authoring error, but they must not resolve by luck: the raw payload is
 * parsed JSON, so iterating it would make the survivor depend on the order Drupal happened to
 * serialise the row in. Nor may they resolve in the attacker's favour - Drupal authors snake_case
 * (`mega_menu`) while the allowlist is camelCase (`megaMenu`), so an "is it the canonical string?"
 * test never fires for the real key and a raw code-point tiebreak hands the win to whichever
 * spelling sorts lowest, which uppercase and punctuation (`MEGA_MENU`, `-mega-menu`) always do.
 *
 * Precedence is therefore the spelling CLOSEST to the canonical key, in order:
 *   1. fewest letters cased differently from the canonical spelling;
 *   2. then fewest separator characters, so added punctuation never wins;
 *   3. then the lowest by UTF-16 code-point order - arbitrary, but stable across payloads, and
 *      reached only between spellings that deviate from the canonical key by exactly as much.
 *
 * The canonical spelling itself scores `[0, 0]`, uniquely, so it still wins outright when authored.
 * Whichever loses is dropped and named in a warning, never silently merged.
 */
const compareSpellings =
  (canonical: string) =>
  (a: string, b: string): number => {
    const [aCase, aSeparators] = spellingDeviation(a, canonical);
    const [bCase, bSeparators] = spellingDeviation(b, canonical);

    return aCase - bCase || aSeparators - bSeparators || (a < b ? -1 : a > b ? 1 : 0);
  };

/**
 * Filter raw `bioland.settings` down to the keys head consumes, with prototype-poisoning keys
 * stripped at every depth. Returns a fresh object; the input is never mutated.
 *
 * Top-level keys come back under their canonical allowlist spelling, and the output is built by
 * walking the allowlist rather than the payload, so neither the surviving key nor its position
 * depends on the payload's own key order. That is load-bearing: matching is case- and
 * separator-insensitive, so `theme` and `THEME` (or `mega_menu`, `mega-menu` and `megaMenu`) all
 * pass the allowlist and would otherwise collapse onto one another during camelCasing, last one
 * winning. Nested keys are left as authored for the depth-7 camelCase pass downstream.
 *
 * Call this BEFORE camelCasing - the point is that nothing unlisted is ever handed on.
 */
export function sanitizeBiolandSettings(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};

  /** canonical key -> every authored spelling of it found in the payload, with its value. */
  const candidates = new Map<string, Array<{ key: string; value: unknown }>>();

  for (const key of Object.getOwnPropertyNames(raw)) {
    const normalized = normalizeKey(key);

    if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(normalized)) continue;

    const canonical = CANONICAL_KEYS.get(normalized);

    if (!canonical) continue;

    const descriptor = Object.getOwnPropertyDescriptor(raw, key);

    if (!descriptor?.enumerable || !("value" in descriptor)) continue;

    const spellings = candidates.get(canonical);

    if (spellings) spellings.push({ key, value: descriptor.value });
    else candidates.set(canonical, [{ key, value: descriptor.value }]);
  }

  const sanitized: Record<string, unknown> = {};
  const truncation: TruncationLog = { count: 0, paths: [] };

  for (const canonical of BIOLAND_SETTINGS_ALLOWLIST) {
    const spellings = candidates.get(canonical);

    if (!spellings?.length) continue;

    const [winner, ...discarded] = [...spellings].sort((a, b) =>
      compareSpellings(canonical)(a.key, b.key),
    );

    if (discarded.length)
      consola.warn(
        `[bioland.settings] "${canonical}" was authored ${spellings.length} times; kept ${forLog(winner!.key)} and dropped ${discarded.map((entry) => forLog(entry.key)).join(", ")}. Remove the duplicate spellings in Drupal.`,
      );

    sanitized[canonical] = stripForbiddenKeys(winner!.value, 1, canonical, truncation);
  }

  if (truncation.count)
    consola.warn(
      `[bioland.settings] dropped ${truncation.count} branch(es) nested deeper than ${MAX_DEPTH}. Paths: ${truncation.paths.map(forLog).join(", ")}${truncation.count > truncation.paths.length ? ", ..." : ""}`,
    );

  return sanitized;
}
