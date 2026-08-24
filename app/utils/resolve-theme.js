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
 *   1. site `config.theme`
 *   2. `config.runTime.theme` (the network-level theme)
 *   3. code defaults (below)
 *
 * NOTE: p02-01 adds the `biolandSettings.theme` leg *in front* of `config.theme`. The leg list in
 * `resolveTheme` is the seam for that change — add the leg, change nothing else.
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
 * ## Presence, not truthiness
 *
 * A leg supplies a leaf when that leaf is present (`!== undefined && !== null`), not when it is
 * truthy. `maxRowsPerColumn: 0` means "unlimited" and must not fall through to the next leg, and
 * an unset `maxLangBeforeWrap` must stay distinguishable from an authored `0`.
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

const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep clone of JSON-shaped data. Keeps the result free of live references into the input config. */
const cloneValue = (value) => {
    if (Array.isArray(value))    return value.map(cloneValue);
    if (isPlainObject(value))    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneValue(v)]));

    return value;
};

/** First leg that supplies this group leaf wins. Presence, not truthiness. */
const resolveLeaf = (legs, group, leaf) => {
    for (const leg of legs) {
        const value = isPlainObject(leg?.[group]) ? leg[group][leaf] : undefined;

        if (isPresent(value)) return cloneValue(value);
    }

    return undefined;
};

/** Union of the group names any leg defines, plus every contract group. */
const collectGroups = legs => [...new Set([...CONTRACT_GROUPS, ...legs.flatMap(leg => Object.keys(leg || {}))])];

/** Union of the leaf names any leg defines under `group`, plus that group's contract leaves. */
const collectLeaves = (legs, group) => [...new Set([
    ...(CONTRACT_LEAVES[group] || []),
    ...legs.flatMap(leg => (isPlainObject(leg?.[group]) ? Object.keys(leg[group]) : []))
])];

/**
 * A non-group key (a scalar or array sitting directly on the theme, not a nested object).
 * Resolved as a single leaf so unknown shapes still pass through.
 */
const resolveScalarGroup = (legs, group) => {
    for (const leg of legs) {
        const value = leg?.[group];

        if (isPresent(value) && !isPlainObject(value)) return cloneValue(value);
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

export function resolveTheme(config) {
    const legs = [config?.theme, config?.runTime?.theme, THEME_DEFAULTS].filter(isPlainObject);

    const resolved = {};

    for (const group of collectGroups(legs)) {
        const leaves = collectLeaves(legs, group);

        // A key no leg defines as an object (e.g. a stray scalar on the theme) passes through as-is.
        if (!leaves.length) {
            const scalar = resolveScalarGroup(legs, group);

            if (isPresent(scalar)) resolved[group] = scalar;
            else if (CONTRACT_GROUPS.includes(group)) resolved[group] = {};

            continue;
        }

        resolved[group] = Object.fromEntries(leaves.map(leaf => [leaf, resolveLeaf(legs, group, leaf)]));
    }

    // Hero is the one group with a derivation rule rather than a plain default.
    resolved.hero.primary = resolveHeroPrimary(resolved.hero.primary, resolved.color);

    return resolved;
}

export default resolveTheme;
