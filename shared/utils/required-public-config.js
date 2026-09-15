/**
 * Single source of truth for the public runtime-config values that have no usable
 * default and can only arrive from the environment.
 *
 * `nuxt.config.ts` declares them as empty strings, so Nuxt maps the matching
 * `NUXT_PUBLIC_*` variable onto them at runtime. When none is set the app still
 * boots and binds its port, and every request then dies deep inside the context
 * resolver with `getSiteSettings cache key missing required context`.
 *
 * Consumed by both halves of the guard:
 *   - `server/plugins/00.assert-public-runtime-config.ts` — at Nitro startup.
 *   - `tests/e2e/assert-e2e-env.mjs` — before Playwright starts its `webServer`.
 *
 * Plain JS (not TS) on purpose: the e2e pre-flight is a bare Node script and can
 * only import it if it stays runnable without a TypeScript loader.
 *
 * Presence check only — a set-but-wrong value passes here and is left to fail
 * later, where the meaning of "valid" is actually known.
 *
 * @typedef {{ key: string, envVar: string }} RequiredPublicConfigEntry
 */

/**
 * Required public runtime-config keys, paired with the environment variable Nuxt
 * reads them from.
 *
 * @type {ReadonlyArray<RequiredPublicConfigEntry>}
 */
export const REQUIRED_PUBLIC_CONFIG = Object.freeze([
  { key: 'env',           envVar: 'NUXT_PUBLIC_ENV'             },
  { key: 'multiSiteCode', envVar: 'NUXT_PUBLIC_MULTI_SITE_CODE' },
  { key: 'baseHost',      envVar: 'NUXT_PUBLIC_BASE_HOST'       },
]);

/** @type {ReadonlyArray<string>} Environment variable names, in declaration order. */
export const REQUIRED_PUBLIC_CONFIG_ENV_VARS = Object.freeze(
  REQUIRED_PUBLIC_CONFIG.map(({ envVar }) => envVar),
);

/** @param {unknown} value */
const isBlank = value => typeof value !== 'string' || value.trim() === '';

/**
 * Entries whose runtime-config value is absent or blank.
 *
 * @param {Record<string, unknown> | undefined | null} publicConfig - `useRuntimeConfig().public`.
 * @returns {RequiredPublicConfigEntry[]}
 */
export function findMissingPublicConfig(publicConfig) {
  const resolved = publicConfig ?? {};

  return REQUIRED_PUBLIC_CONFIG.filter(({ key }) => isBlank(resolved[key]));
}

/**
 * Build the failure message. Names variables only — never values, since a
 * runtime-config dump would leak whatever the environment actually holds.
 *
 * @param {ReadonlyArray<RequiredPublicConfigEntry>} missing - Non-empty missing set.
 * @returns {string}
 */
export function formatMissingPublicConfigError(missing) {
  const pairs = missing.map(({ key, envVar }) => `public.${key} (${envVar})`).join(', ');

  return [
    `Missing required public runtime config: ${pairs}.`,
    'These have no default in nuxt.config.ts, so an empty value makes every request fail with',
    '"getSiteSettings cache key missing required context".',
    'Fix: export the variables above, or set them in a root .env (cp .env.example .env).',
  ].join('\n');
}
