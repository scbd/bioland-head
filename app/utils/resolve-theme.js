/**
 * Canonical, crash-safe theme resolution for the head.
 *
 * Every theme read in the app funnels through this one function. Before it existed the same
 * theme keys were read nine different ways across six files, each with its own precedence and
 * its own crash path (`theme.backGround.secondary` threw when `backGround` was absent;
 * `theme.hero.primary[0]` threw when `primary` was absent; an unset `maxLangBeforeWrap` fed
 * `undefined` into `Array.prototype.splice` and silently emptied the language menu).
 *
 * ## Precedence (leg order, highest first)
 *
 *   1. `biolandSettings.theme` (Drupal-authored, per-site)
 *   2. site `config.theme`
 *   3. `config.runTime.theme` (the network-level theme)
 *   4. code defaults (below)
 *
 * Leg 1 is the Drupal editor's authored theme, added by p02-01 (BL-885). It is passed in by the
 * caller rather than read off `config`, because the only camelCased copy of `biolandSettings` the
 * app may rely on is `siteStore.biolandSettings` — see "Input keys are post-camelCase" below.
 *
 * ## Absence is fall-through, never an error
 *
 * `biolandSettings` is attached best-effort by dmsm, which swallows Drupal errors, and no site
 * carries an authored theme until an editor saves one. So the authored leg is absent far more
 * often than not: `undefined`, `null`, a `biolandSettings` with no `theme` key, and an empty
 * `theme` object all mean "this leg supplies nothing" and leave every leaf to the legs below.
 * An unseeded site therefore resolves byte-identically to the three-leg result. This also covers
 * the accepted flicker in ADR 0012: a Drupal blip drops the key for one cache window and the site
 * briefly reverts to fallback branding. That is accepted behaviour, not a condition to throw on.
 *
 * ## Input keys are post-camelCase (depth 7)
 *
 * Drupal authors snake_case (`back_ground.secondary`, `mega_menu.max_rows_per_column`). dmsm
 * passes those through unchanged — its SQL is an exact match on `name = 'bioland.settings'` and it
 * assigns the whole config object without touching keys. The head does all case conversion, in
 * `server/utils/context-unified.ts`, which camelCases to depth 7 into the `biolandSettings` field
 * of the unified context. That transformed copy reaches the app as `siteStore.biolandSettings`.
 * This resolver therefore sees `backGround`, never `back_ground`, and every fixture asserts the
 * transformed shape.
 *
 * ## Untrusted input
 *
 * The authored leg is a row from a Drupal database that site editors can write. Keys that alias
 * the prototype chain (`__proto__`, `constructor`, `prototype`) are dropped at both the group and
 * the leaf level — see `isSafeKey`. They are dropped for every leg, not just the authored one,
 * since a leg's trust level is not the resolver's to assume.
 *
 * ## Merge rule: per-leaf, not per-object
 *
 * Legs merge one leaf at a time, two levels deep (`theme.<group>.<leaf>`). A site that authors
 * only `color.primary` still inherits `color.secondary`, `megaMenu.*`, and the rest from the
 * network leg. A whole-object merge would blank out every key the site did not restate.
 *
 * Groups the resolver does not know about pass through untouched, so callers reading keys outside
 * the contract (for example `color.secondaryTextOver`, `homePageWidgets.columns`,
 * `megaMenu.forums`) keep working.
 *
 * ## Presence, not truthiness — with three validated leaves
 *
 * A leg supplies a leaf when that leaf is present (`!== undefined && !== null`), not when it is
 * truthy. `maxRowsPerColumn: 0` means "unlimited" and must not fall through to the next leg, and
 * an unset `maxLangBeforeWrap` must stay distinguishable from an authored `0`.
 *
 * Three leaves are the exception, because their pre-refactor reads used `||` AND a falsy-but-present
 * value breaks the render rather than meaning something. See `LEAF_VALIDATORS`. For those, a leg
 * supplies the leaf only when the value is also *usable*; otherwise it falls through to the next leg
 * exactly as the old `||` chain did. Every other leaf keeps the plain presence rule, including
 * `backGround.secondary`, whose old read had no `||` at all — `''` was preserved before this
 * refactor and is preserved now.
 *
 * ## `i18n.maxLangBeforeWrap` is deliberately left unset
 *
 * The resolver returns `undefined` when no leg authors it. It does NOT invent a "never wrap"
 * sentinel, because there was no such value before this refactor — the old code fed `undefined`
 * straight into `Array.prototype.splice`, whose return value is the *removed* elements, so an unset
 * `maxLangBeforeWrap` really did render an empty language bar. That was a bug, not a value worth
 * preserving, and inventing a replacement default here would violate the totality rule below.
 * **Contract: the caller owns the unset behaviour.** `language-bar.vue` supplies
 * `?? Number.MAX_SAFE_INTEGER` ("show everything"); any future consumer must make the same choice
 * explicitly rather than passing `undefined` into an arithmetic or slicing API.
 *
 * ## Hero rule
 *
 * `hero.primary` is *derived* as `[color.primary, color.secondary]` ONLY when it is absent from
 * every leg. An authored hero passes through untouched: live prod site `be` carries
 * `hero.primary[1] = "#CBB279"`, which is not its `color.secondary`, so an always-derive rule
 * would visibly change that site. A partially authored hero keeps its authored slots and has only
 * the missing slots filled from the derived pair.
 *
 * ## Totality
 *
 * For ANY input, including `{}`, `null`, or a config with no theme at all, every contract group
 * (`color`, `backGround`, `hero`, `megaMenu`, `i18n`, `homePageWidgets`) is an object and
 * `hero.primary` is an array of length 2. Contract leaves are always own properties, so no
 * optional chain and no index access on the result can throw. A leaf whose value is genuinely
 * unset stays `undefined` rather than being invented — this function preserves today's rendered
 * values, it does not add defaults that did not exist.
 *
 * ## Cloning
 *
 * The result never aliases the input. Arrays and plain objects reaching the caller are cloned, so
 * a caller mutating the resolved theme cannot corrupt the shared site config.
 *
 * @param {object|null|undefined} config - the site config (`siteStore.config`).
 * @param {object|null|undefined} authoredTheme - the Drupal-authored theme, i.e.
 *   `siteStore.biolandSettings?.theme`, already camelCased to depth 7. Absent for every site that
 *   has never had a theme saved, which today is the entire fleet.
 * @returns {object} the resolved theme. Never null, never throws.
 */

/** Code defaults leg. Only keys that had a hardcoded fallback before this refactor belong here. */
const THEME_DEFAULTS = Object.freeze({
    color   : { primary: '#009edb' },  // was hardcoded at app/stores/site.js:140
    megaMenu: { maxColumns: 5 }        // was hardcoded as `|| 5` at schema-org.js:1152 and drop-down.vue:63
});

/** Contract groups that must always exist on the result so callers cannot crash on a missing group. */
const CONTRACT_GROUPS = Object.freeze(['color', 'backGround', 'hero', 'megaMenu', 'i18n', 'homePageWidgets']);

/** Contract leaves, per group, that must always be own properties of the result. */
const CONTRACT_LEAVES = Object.freeze({
    color     : ['primary', 'secondary'],
    backGround: ['secondary'],
    hero      : ['primary'],
    megaMenu  : ['maxColumns', 'maxRowsPerColumn', 'horizontalCardMax', 'forums'],
    i18n      : ['maxLangBeforeWrap']
});

const isPresent = value => value !== undefined && value !== null;

/** A colour a browser can actually apply. `''` interpolated into a style declaration voids it. */
const isUsableColor = value => typeof value === 'string' && value.trim() !== '';

/** A column count that yields at least one column. `0` collapses the mega-menu grid to nothing. */
const isUsableColumnCount = value => Number.isFinite(Number(value)) && Number(value) >= 1;

/**
 * Per-leaf validators — the deliberate exceptions to the presence rule.
 *
 * A leaf earns a validator only when BOTH hold: its pre-refactor read used `||` (so falsy values
 * already fell through and no live site can be relying on one), and a falsy-but-present value
 * produces a broken render rather than a meaningful setting. That is exactly three leaves:
 *
 * - `color.primary`   — was `|| '#009edb'` at site.js:140. `''` voids every `solid ${primary}`
 *                       border and `background: ${primary}` declaration that consumes it.
 * - `color.secondary` — was `||` (no final default) at site.js:143. Same failure mode, and
 *                       `hero.primary` derives its second slot from it.
 * - `megaMenu.maxColumns` — was `|| 5` at schema-org.js:1152 and drop-down.vue:63. `0` makes
 *                       `organizeSectionsIntoRows` collapse every section into one unbounded row
 *                       (`Math.min(span, 0) === 0`, so the wrap branch never fires).
 *
 * Explicitly NOT validated, with reasons:
 * - `backGround.secondary` — its old read had no `||`, so `''` was already passed through and
 *   rendered. `backGround.primary: ''` demonstrably occurs in the live network theme; rejecting it
 *   would be the regression, not the fix.
 * - `megaMenu.maxRowsPerColumn` / `horizontalCardMax` / `forums` — no `||` in the old reads, and
 *   `0` is a meaningful value ("unlimited") that must not fall through.
 * - `i18n.maxLangBeforeWrap` — `0` and `''` both mean "wrap immediately"; the language bar degrades
 *   gracefully (every language moves into the overflow dropdown) rather than breaking. See the
 *   contract note in the header comment for the *unset* case.
 */
const LEAF_VALIDATORS = Object.freeze({
    color   : { primary: isUsableColor, secondary: isUsableColor },
    megaMenu: { maxColumns: isUsableColumnCount }
});

const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Keys that alias the prototype chain. The authored leg is untrusted editor input, and these are
 * dropped before any key is used as a lookup index or copied onto the result.
 *
 * This is a security control, not a tidiness rule. On the unguarded resolver each of these is a
 * hard crash, which for a theme read on every page is a total render failure:
 *
 * - `{ megaMenu: { __proto__: {...} } }` — `LEAF_VALIDATORS.megaMenu['__proto__']` resolves up the
 *   prototype chain to `Object.prototype`, which is truthy but not callable, so the validator call
 *   throws `TypeError: isUsable is not a function`.
 * - `{ __proto__: {...} }` / `{ constructor: {...} }` at the top level — `CONTRACT_LEAVES[group]`
 *   likewise resolves to an inherited value, and spreading it throws `TypeError: ... is not
 *   iterable`, so the `|| []` fallback never fires.
 *
 * Filtering the keys out of the group and leaf unions closes both, and keeps a hostile key from
 * being written onto the result even where the lookup would not have thrown.
 */
const DANGEROUS_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

const isSafeKey = key => !DANGEROUS_KEYS.includes(key);

/** Own, prototype-safe keys of a plain object. */
const safeKeys = object => Object.keys(object).filter(isSafeKey);

/** Deep clone of JSON-shaped data. Keeps the result free of live references into the input config. */
const cloneValue = (value) => {
    if (Array.isArray(value))    return value.map(cloneValue);
    if (isPlainObject(value))    return Object.fromEntries(safeKeys(value).map(k => [k, cloneValue(value[k])]));

    return value;
};

/**
 * First leg that supplies this group leaf wins. Presence, not truthiness — except for the leaves in
 * `LEAF_VALIDATORS`, which must also be usable or they fall through to the next leg.
 */
const resolveLeaf = (legs, group, leaf) => {
    const isUsable = LEAF_VALIDATORS[group]?.[leaf];

    for (const leg of legs) {
        const value = isPlainObject(leg?.[group]) ? leg[group][leaf] : undefined;

        if (!isPresent(value))            continue;
        if (isUsable && !isUsable(value)) continue;

        return cloneValue(value);
    }

    return undefined;
};

/** Union of the group names any leg defines, plus every contract group. */
const collectGroups = legs => [...new Set([...CONTRACT_GROUPS, ...legs.flatMap(leg => safeKeys(leg || {}))])];

/** Union of the leaf names any leg defines under `group`, plus that group's contract leaves. */
const collectLeaves = (legs, group) => [...new Set([
    ...(CONTRACT_LEAVES[group] || []),
    ...legs.flatMap(leg => (isPlainObject(leg?.[group]) ? safeKeys(leg[group]) : []))
])];

/**
 * A theme key with no leaves to merge — a scalar or array sitting directly on the theme, or an
 * object every leg left empty. Resolved whole so unknown shapes still pass through: the old
 * whole-object getter kept `theme.foo = {}`, and a caller doing `theme.foo.bar` without an optional
 * chain must not start throwing. Any plain object reaching here is empty by construction, since a
 * non-empty one would have produced leaves.
 */
const resolveOpaqueGroup = (legs, group) => {
    for (const leg of legs) {
        const value = leg?.[group];

        if (isPresent(value)) return cloneValue(value);
    }

    return undefined;
};

/**
 * Derive-when-absent hero. Fills only the slots no leg authored.
 * @param {Array|undefined} authored - the merged `hero.primary`, if any leg supplied one.
 * @param {object} color - the resolved color group.
 */
const resolveHeroPrimary = (authored, color) => {
    const derived = [color.primary, color.secondary];
    const source  = Array.isArray(authored) ? authored : [];

    return [0, 1].map(i => (isPresent(source[i]) ? source[i] : derived[i]));
};

export function resolveTheme(config, authoredTheme) {
    const legs = [authoredTheme, config?.theme, config?.runTime?.theme, THEME_DEFAULTS].filter(isPlainObject);

    const resolved = {};

    for (const group of collectGroups(legs)) {
        const leaves = collectLeaves(legs, group);

        // A key with nothing to merge (a stray scalar, or an object every leg left empty) passes
        // through as-is rather than being dropped off the result.
        if (!leaves.length) {
            const opaque = resolveOpaqueGroup(legs, group);

            if (isPresent(opaque)) resolved[group] = opaque;
            else if (CONTRACT_GROUPS.includes(group)) resolved[group] = {};

            continue;
        }

        resolved[group] = Object.fromEntries(leaves.map(leaf => [leaf, resolveLeaf(legs, group, leaf)]));
    }

    // Hero is the one group with a derivation rule rather than a plain default.
    resolved.hero.primary = resolveHeroPrimary(resolved.hero.primary, resolved.color);

    return resolved;
}
