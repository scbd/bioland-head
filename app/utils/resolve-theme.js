/**
 * Pure theme resolver for bioland-head.
 *
 * Implements the head-theme contract (ADR 0012). Pure function, zero dependencies, no side
 * effects. Safe to call anywhere on the server or the client.
 *
 * It guarantees totality: every call returns a fully populated, freeze-safe theme object with no
 * missing groups and no missing contract leaves, regardless of input shape (before this refactor
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
 * Leg 1 is the theme authored by a site editor in Drupal, passed in through `biolandSettings`
 * (added in BL-885).
 *
 * Leg 2 is the site-level theme (formerly read off `site.config.theme`), configured in DMSM per site.
 *
 * Leg 3 is the network-level theme (formerly read off `site.config.runTime.theme`), shared across
 * all sites in the multisite deployment.
 *
 * Leg 4 contains the two hardcoded fallbacks that existed in the codebase before this refactor:
 *
 *   - `color.primary: '#009edb'`  — was hardcoded at `app/stores/site.js:140`
 *   - `megaMenu.maxColumns: 5`   — was hardcoded at `app/composables/schema-org.js:1152` and
 *                                 `app/components/page/header/mega-menu/drop-down.vue:63`
 *
 * ## Merging rules
 *
 * Legs merge one leaf at a time, two levels deep (`theme.<group>.<leaf>`). A site that authors
 * only `color.primary` still inherits `color.secondary`, `megaMenu.*`, and the rest from the
 * network leg. A whole-object merge would blank out every key the site did not restate.
 *
 * Groups the resolver does not know about pass through untouched, so callers reading keys outside
 * the contract (for example `color.secondaryTextOver`, `homePageWidgets.news`, `megaMenu.forums`)
 * keep working.
 *
 * ## The presence rule and its exceptions
 *
 * A leaf is taken from the highest leg that defines it — presence, not truthiness (`value !==
 * undefined && value !== null`). An editor explicitly setting a property to `false` or `''` gets
 * that value; it does not fall through to the network default.
 *
 * Five leaves are deliberate exceptions to the presence rule, because their pre-refactor reads used
 * `||` or their consumer crashes on an unusable value:
 *
 *   - `color.primary` must be a non-empty string; `''` voids every `solid ${primary}` border and
 *     falls through to the network leg (or code default `#009edb`).
 *   - `color.secondary` must be a non-empty string; `''` voids borders and buttons, and feeds into
 *     the second hero slot.
 *   - `megaMenu.maxColumns` must be `>= 1`; `0` collapses the mega-menu grid to zero columns and
 *     falls through to the network leg (or code default `5`).
 *   - `megaMenu.maxRowsPerColumn` must be a non-negative finite integer; `0` is preserved as
 *     "unlimited", while invalid values (negative, non-numeric, fraction) fall through.
 *   - `i18n.maxLangBeforeWrap` must be `>= 1`; `0`, `''`, or `false` empties `limitedMenus`
 *     and hides all language selectors, so it falls through to the network leg.
 *
 * ## The hero derive rule
 *
 * `hero.primary` is *derived* as `[color.primary, color.secondary]` ONLY when it is absent from
 * every leg. An authored hero passes through untouched: live prod site `be` carries
 * `hero.primary[1] = "#CBB279"`, which is not its `color.secondary`, so an always-derive rule
 * would visibly change that site. A partially authored hero keeps its authored slots and has only
 * the missing slots filled from the derived pair. An authored slot that is present but not a usable
 * 3- or 6-digit hex colour string is treated like a missing slot, falling through to the derived
 * slot so `hero-image.vue` and `cards/media/hero.vue`'s `hexToRgb` does not crash.
 *
 * ## Output immutability
 *
 * The result never aliases the input. Arrays and plain objects reaching the caller are cloned, so
 * a caller mutating the resolved theme cannot corrupt the shared site config.
 *
 * @param {object|null|undefined} config - the site config (`siteStore.config`).
 * @param {object|null|undefined} authoredTheme - the Drupal-authored theme, i.e.
 *   `siteStore.biolandSettings?.theme`, already camelCased to depth 7. Absent for every site that
 *   has never had a theme saved, which today is the entire fleet.
 * @returns {object} a complete, crash-safe theme object.
 */

/** Code defaults leg. Only keys that had a hardcoded fallback before this refactor belong here. */
const THEME_DEFAULTS = Object.freeze({
    color   : { primary: '#009edb' },  // was hardcoded at app/stores/site.js:140
    megaMenu: { maxColumns: 5 }        // was hardcoded as `|| 5` at schema-org.js:1152 and drop-down.vue:63
});

/**
 * Freeze a null-prototype map so lookups never inherit Object.prototype names
 * (`toString`, `valueOf`, `hasOwnProperty`, …). A plain-object table lets those
 * names resolve to inherited functions and crash collectLeaves / resolveLeaf.
 */
const freezeOwnMap = (entries) => Object.freeze(Object.assign(Object.create(null), entries));

/** Contract leaves, per group, that must always be own properties of the result. */
const CONTRACT_LEAVES = freezeOwnMap({
    color          : Object.freeze(['primary', 'secondary']),
    backGround     : Object.freeze(['secondary']),
    hero           : Object.freeze(['primary']),
    megaMenu       : Object.freeze(['maxColumns', 'maxRowsPerColumn', 'horizontalCardMax', 'forums']),
    i18n           : Object.freeze(['maxLangBeforeWrap']),
    homePageWidgets: Object.freeze(['columns'])
});

/**
 * Contract groups that must always exist on the result so callers cannot crash on a missing group.
 *
 * Derived from `CONTRACT_LEAVES` rather than listed separately, so the two can never drift. Every
 * contract group therefore has at least one contract leaf, which is what guarantees the group is
 * always built by the leaf path below and never falls to `resolveOpaqueGroup`.
 */
const CONTRACT_GROUPS = Object.freeze(Object.keys(CONTRACT_LEAVES));

const isPresent = value => value !== undefined && value !== null;

/**
 * Hard ceilings for `homePageWidgets.columns`. Real themes use three outer columns and a handful
 * of widget names each; these caps sit well above that while blocking editor-authored payloads that
 * would expand into millions of `v-for` iterations on the home page.
 */
const MAX_HOME_PAGE_COLUMNS = 32;
const MAX_WIDGETS_PER_COLUMN = 32;

/**
 * A non-empty widget name string. `page/home-page-widget-selection.vue` requires `is: String`;
 * unknown names render an empty slot (safe), but a non-string reaches the same prop path.
 */
const isUsableWidgetName = value => typeof value === 'string' && value.trim() !== '';

/**
 * One home-page column: a bounded array of usable widget names. The inner
 * `v-for="widgetName in column"` in `page/home-chm.vue` treats a *number* as a range and a
 * *string* as characters, so a numeric/string entry is the same class of render DoS as a
 * non-array outer `columns`.
 */
const isUsableColumn = value =>
    Array.isArray(value)
    && value.length <= MAX_WIDGETS_PER_COLUMN
    && value.every(isUsableWidgetName);

/**
 * The home page renders one grid column per entry of `homePageWidgets.columns`
 * (`v-for="(column, i) in columnsOfWidgetComponents"` in `page/home-chm.vue`). Vue's `v-for` over a
 * *number* renders that many nodes and over a *string* iterates per character, so an authored
 * `columns: 50000000` would hang or OOM the home page, SSR included. The same DoS applies one level
 * deeper: `columns: [50000000]` is an outer array (passes a bare `Array.isArray` check) but the
 * inner `v-for="widgetName in column"` then iterates fifty million times. Only a bounded array of
 * bounded widget-name arrays is usable; anything else falls through to the next leg. An empty
 * outer array (`[]`) remains usable — ratified 2026-08-24, "no widgets".
 */
const isUsableColumnList = value =>
    Array.isArray(value)
    && value.length <= MAX_HOME_PAGE_COLUMNS
    && value.every(isUsableColumn);

/** A colour a browser can actually apply. `''` interpolated into a style declaration voids it. */
const isUsableColor = value => typeof value === 'string' && value.trim() !== '';

/** Restrict numeric coercion to numbers and non-empty strings so objects with throwing toString/valueOf cannot throw TypeError. */
const isUsableNumber = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));

/** A column count that yields at least one column. `0` collapses the mega-menu grid to nothing. */
const isUsableColumnCount = value => isUsableNumber(value) && Number(value) >= 1;

/** A row count that can be passed to Array.slice(). Non-negative finite integer, where 0 is preserved as "unlimited". */
const isUsableRowLimit = value => isUsableNumber(value) && Number.isInteger(Number(value)) && Number(value) >= 0;

/** A language limit that renders at least one language. `0` empties the menu and hides the bar. */
const isUsableLanguageLimit = value => isUsableNumber(value) && Number(value) >= 1;

/** Supported 3- or 6-digit hex format that hexToRgb supports. */
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isSupportedHexColor = value => typeof value === 'string' && HEX_COLOR_REGEX.test(value);

/**
 * Per-leaf validators — the deliberate exceptions to the presence rule.
 */
const LEAF_VALIDATORS = freezeOwnMap({
    homePageWidgets: freezeOwnMap({ columns: isUsableColumnList }),
    color          : freezeOwnMap({ primary: isUsableColor, secondary: isUsableColor }),
    megaMenu       : freezeOwnMap({ maxColumns: isUsableColumnCount, maxRowsPerColumn: isUsableRowLimit }),
    i18n           : freezeOwnMap({ maxLangBeforeWrap: isUsableLanguageLimit })
});

const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Keys that must never be copied onto the result (pollution / confusing own props).
 */
const DANGEROUS_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

const isSafeKey = key => !DANGEROUS_KEYS.includes(key);

/**
 * Own, prototype-safe keys of a plain object.
 */
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
    const validators = Object.hasOwn(LEAF_VALIDATORS, group) ? LEAF_VALIDATORS[group] : undefined;
    const isUsable = validators && Object.hasOwn(validators, leaf) ? validators[leaf] : undefined;

    for (const leg of legs) {
        if (!Object.hasOwn(leg, group)) continue;

        const value = isPlainObject(leg?.[group]) && Object.hasOwn(leg[group], leaf) ? leg[group][leaf] : undefined;

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
    ...legs.flatMap(leg => (Object.hasOwn(leg, group) && isPlainObject(leg[group]) ? safeKeys(leg[group]) : []))
])];

/**
 * A theme key with no leaves to merge — a scalar or array sitting directly on the theme, or an
 * object every leg left empty. Resolved whole so unknown shapes still pass through: the old
 * whole-object getter kept `theme.foo = {}`, and a caller doing `theme.foo.bar` without an optional
 * chain must not start throwing. Any plain object reaching here is empty by construction, since a
 * non-empty one would have produced leaves.
 *
 * Only ever reached for a NON-contract group: every contract group has contract leaves, so it is
 * always built by the leaf path instead.
 */
const resolveOpaqueGroup = (legs, group) => {
    for (const leg of legs) {
        const value = Object.hasOwn(leg, group) ? leg[group] : undefined;

        if (isPresent(value)) return cloneValue(value);
    }
};

/**
 * Derive-when-absent hero. Fills only the slots no leg authored with a usable colour string.
 * A present-but-unusable slot falls through to the derived colour for that index.
 * @param {Array|undefined} authored - the merged `hero.primary`, if any leg supplied one.
 * @param {object} color - the resolved color group.
 */
const resolveHeroPrimary = (authored, color) => {
    const derived = [color.primary, color.secondary];
    const source  = Array.isArray(authored) ? authored : [];

    return [0, 1].map(i => (isSupportedHexColor(source[i]) ? source[i] : derived[i]));
};

const MAX_AUTHORED_THEME_DEPTH = 64;
const MAX_AUTHORED_THEME_NODES = 10000;

/** Reject oversized editor data before recursive cloning or later SSR serialization. */
const isBoundedAuthoredTheme = theme => {
    const stack = [{ value: theme, depth: 0 }];
    let remaining = MAX_AUTHORED_THEME_NODES;

    while (stack.length) {
        const { value, depth } = stack.pop();

        if (depth > MAX_AUTHORED_THEME_DEPTH || --remaining < 0) return false;
        if (value === null || typeof value !== 'object') continue;
        if (Array.isArray(value) && value.length > MAX_AUTHORED_THEME_NODES) return false;

        for (const key in value) {
            if (!Object.hasOwn(value, key)) continue;
            if (stack.length >= remaining) return false;

            stack.push({ value: value[key], depth: depth + 1 });
        }
    }

    return true;
};

export function resolveTheme(config, authoredTheme) {
    // An invalid authored leg falls through as a whole; trusted site/runtime settings remain usable.
    const authored = isPlainObject(authoredTheme) && isBoundedAuthoredTheme(authoredTheme) ? authoredTheme : undefined;
    const legs = [authored, config?.theme, config?.runTime?.theme, THEME_DEFAULTS].filter(isPlainObject);

    const resolved = {};

    for (const group of collectGroups(legs)) {
        const leaves = collectLeaves(legs, group);

        // A theme group that has no leaves in any leg (an empty object or a scalar) is copied
        // through as-is rather than being dropped off the result.
        if (!leaves.length) {
            const opaque = resolveOpaqueGroup(legs, group);

            if (isPresent(opaque)) resolved[group] = opaque;
            else if (CONTRACT_GROUPS.includes(group)) resolved[group] = {};

            continue;
        }

        resolved[group] = Object.fromEntries(leaves.map(leaf => [leaf, resolveLeaf(legs, group, leaf)]));
    }

    // Hero is derived when absent from every source.
    resolved.hero.primary = resolveHeroPrimary(resolved.hero.primary, resolved.color);

    return resolved;
}
