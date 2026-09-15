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
 * So this module applies TWO passes, before any camelCasing:
 *   1. An explicit top-level ALLOWLIST of the keys head actually consumes. It fails closed - a new
 *      editor-authored key reaches no consumer until it is listed here - and it documents what
 *      head depends on.
 *   2. A depth-agnostic strip of `__proto__` / `constructor` / `prototype` inside the kept
 *      branches. Belt and braces on purpose: the allowlist only governs the top level, while the
 *      proven `mega_menu.__proto__` failure lives inside a key the allowlist must keep.
 *
 * Consumer-side guards (for example the prototype-key guard in `app/utils/resolve-theme.js`) stay
 * where they are. Defence in depth is intentional.
 */

/** Keys `bioland.settings` may expose, with the consumer that justifies each one. */
export const BIOLAND_SETTINGS_ALLOWLIST = [
  /** app/stores/site.js:162 -> app/utils/resolve-theme.js (site theme, every page since BL-885) */
  "theme",
  /** app/stores/site.js:116 - `config.promoteAndStickyPublic` */
  "config",
  /** app/plugins/google-tags.client.ts:161 - `googleAnalyticsIds` */
  "googleAnalyticsIds",
  /** app/components/page/home-page-widget-selection.vue and the widget/* components */
  "homeWidgets",
  /** app/components/page/header/mega-menu/**, server/utils/drupal/drupal-content-types.js:26 */
  "megaMenu",
] as const;

/** Keys that can poison an object graph, stripped at any depth. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Hostile input can nest arbitrarily deep. Bound the walk so a pathological payload cannot blow the
 * stack; anything past the bound is dropped rather than passed through unfiltered (fail closed).
 */
const MAX_DEPTH = 32;

/** Case- and separator-insensitive key identity, so `mega_menu`, `mega-menu` and `megaMenu` match. */
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALLOWED_KEYS = new Set(BIOLAND_SETTINGS_ALLOWLIST.map(normalizeKey));

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep copy with every forbidden key removed, at any depth and regardless of authored casing. */
function stripForbiddenKeys(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return undefined;

  if (Array.isArray(value)) return value.map((entry) => stripForbiddenKeys(entry, depth + 1));

  if (!isPlainObject(value)) return value;

  const safe: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(normalizeKey(key))) continue;

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (!descriptor?.enumerable || !("value" in descriptor)) continue;

    safe[key] = stripForbiddenKeys(descriptor.value, depth + 1);
  }

  return safe;
}

/**
 * Filter raw `bioland.settings` down to the keys head consumes, with prototype-poisoning keys
 * stripped at every depth. Returns a fresh object; the input is never mutated.
 *
 * Call this BEFORE camelCasing - the point is that nothing unlisted is ever handed on.
 */
export function sanitizeBiolandSettings(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};

  const sanitized: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(raw)) {
    const normalized = normalizeKey(key);

    if (FORBIDDEN_KEYS.has(key) || FORBIDDEN_KEYS.has(normalized)) continue;
    if (!ALLOWED_KEYS.has(normalized)) continue;

    const descriptor = Object.getOwnPropertyDescriptor(raw, key);

    if (!descriptor?.enumerable || !("value" in descriptor)) continue;

    sanitized[key] = stripForbiddenKeys(descriptor.value, 1);
  }

  return sanitized;
}
