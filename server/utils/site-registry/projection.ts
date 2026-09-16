import type { DmsmConfig } from '#shared/types/context'
import type {
  MultiSiteConfigInput,
  SiteConfigInput,
  SiteTheme
} from '#shared/types/site-config'

/**
 * The public site-config projection (p02-03, BL-983).
 *
 * `toPublicConfig()` turns a registry read (`SiteConfigInput` + `MultiSiteConfigInput`, both of
 * which carry secrets and PII by design) into the payload a browser may receive.
 *
 * ## Why the model is ADDITIVE
 *
 * The payload is built by starting from nothing and naming every key it emits — R1 of
 * docs/specs/site-config-contract.md. The two rejected alternatives are the same bug wearing
 * different clothes:
 *
 *   - spreading the source record and then deleting the bad keys — a key added upstream ships by
 *     default.
 *   - filtering the source record's own entries through an include-list at runtime — same
 *     failure: the include-list only governs which of the keys that EXIST survive, so nothing
 *     tells you a new key appeared, and a renamed key silently disappears instead of failing.
 *
 * dmsm's `mapPublicMultiSiteSite` is the filter-down model this replaces. `panoramaKey` and `meta`
 * are exactly the kind of key that escapes under it.
 *
 * Completeness is enforced twice. `SiteConfig` is a mapped type over `PUBLIC_SITE_CONFIG_KEYS`
 * with every member REQUIRED, so in an editor a forgotten key is a compile error and an unlisted
 * key in the returned literal is an excess-property error. That type check is NOT the CI gate,
 * honestly: this repo has no repo-wide typecheck script, and the suite-scoped `test.typecheck`
 * runs with `ignoreSourceErrors: true`, so a type error inside THIS file would not fail
 * `yarn test:run`. The enforcing gate is the runtime assertion in the unit suite —
 * `Object.keys(toPublicConfig(...))` must equal `PUBLIC_SITE_CONFIG_KEYS` exactly, for a populated
 * record and for a minimal one. The test-d file gates the type's shape (every member required).
 *
 * Adding a key to the public surface therefore means editing `PUBLIC_SITE_CONFIG_KEYS` — i.e. a
 * contract change, reviewed as one, with docs/specs/site-config-contract.md updated alongside it.
 *
 * ## The allowlist
 *
 * `siteCode`, `multiSiteCode`, `name`, `description`, `host`, `published`, `logo`, `defaultLocale`,
 * `locales`, `country`, `countries`, `continent`, `region`, `env`, `theme` (merged), `hasBl1`
 * (normalized), `geoBonPage`, `hideHomePageWidgets`, `migrated`, `i18n`, `scbd`.
 *
 * ## Never included
 *
 * `dataBase`, `dns`, `drupal`, `defaultSmtpCredentials`, `panoramaKey`, `auth`, `dmsmApi`, the
 * image name/version fields, `root`, `drupalRoot`, `siteRoot`, `dataBaseName`, `smtpCredentials`,
 * and `meta` at BOTH levels (`createdBy`/`updatedBy` are `{email, uid}` — staff emails). Also
 * absent, as non-secret but non-public: `hasBl2`, `aliases`, `migratedFailed`, `cdn`, `baseHost`,
 * `prePublishedBaseHost`, `gaiaApi`, `showBl1Link`.
 *
 * ## `redirect` — NOT shipped
 *
 * The p02-03 task text listed `redirect` in the include-list. The p01-01 contract (merged) settles
 * it the other way and wins: `redirect` is absent from dmsm's `publicSiteProperties` today, and the
 * spec's allowed-difference list makes "`redirect` present on the registry side" a parity failure
 * with no exception. Emitting it would be a behavior change rather than a migration:
 * `buildSiteContext` reads `config.redirect` (`server/utils/context-unified.ts:444`) and would
 * begin acting on operator-supplied free text it has never received. Restoring `redirect` is its
 * own ticket, reviewed on its own merits.
 *
 * ## `hasBl2` — NOT shipped, for the same reason as `redirect`
 *
 * An earlier revision shipped `hasBl2` on the grounds that it is neither secret nor PII — just a
 * boolean grouping flag, the sibling of `hasBl1` — and that emitting it is inert until p03-02 calls
 * this function. Inertness is not the test. dmsm strips it from the anonymous response today
 * (docs/specs/site-config-contract.md:124) and the parity allowed-difference list does not exempt
 * it, so emitting it here is a registry-only field on the 98/211 sites that populate it and a
 * non-exempt difference the moment p03-01 diffs the two payloads. Adding it to the public surface
 * is its own contract change, argued on its own merits with the spec updated alongside it.
 *
 * ## `runTime` — not emitted, and the `settings` decision
 *
 * This projection emits a flat public payload; `runTime` is a dmsm-side derived bag whose public
 * survivors (`env`, `multiSiteCode`, `host`, `countries`, `theme`) are already top-level members
 * here. Per R5, `runTime.settings` is NOT emitted: a grep of `app/`, `server/` and `shared/` for
 * `runTime` finds three hits, none of which read `settings` — `context-unified.ts:491` and
 * `app/stores/site.js:158` read `runTime.biolandSettings`, and `app/utils/resolve-theme.js:360`
 * reads `runTime.theme`. It has no consumer and has always been `undefined`; emitting it would
 * invite one.
 *
 * ## Leak testing boundary
 *
 * The serialized-output leak assertion here covers THIS projection only. The `/api/context` and
 * SSR-payload assertions belong to p03-02, deliberately: at p02-03 that surface is still dmsm-fed,
 * so asserting it now would pass for reasons unrelated to this code and give false assurance on
 * the plan's #1 security requirement. The shared helper is `shared/utils/leak-detection.ts`.
 */

/**
 * The public key list. This array IS the allowlist — it drives the output type, and the tests
 * assert the emitted key set against it. Adding an entry is a contract change.
 */
export const PUBLIC_SITE_CONFIG_KEYS = [
  'siteCode',
  'multiSiteCode',
  'name',
  'description',
  'host',
  'published',
  'logo',
  'defaultLocale',
  'locales',
  'country',
  'countries',
  'continent',
  'region',
  'env',
  'theme',
  'hasBl1',
  'geoBonPage',
  'hideHomePageWidgets',
  'migrated',
  'i18n',
  'scbd'
] as const

export type PublicSiteConfigKey = (typeof PUBLIC_SITE_CONFIG_KEYS)[number]

/**
 * The projection's output shape: every allowlisted key, each REQUIRED as a property (its value may
 * still be `undefined`, which `JSON.stringify` drops from the wire). Requiredness is the point —
 * it is what turns a forgotten key into a compile error.
 *
 * `hasBl1` is narrowed to a plain `boolean`: `DmsmConfig` types the pre-cutover wire
 * (`boolean | string | undefined`), while R3 requires the successor to emit a normalized boolean
 * unconditionally.
 */
export type SiteConfig = {
  [K in Exclude<PublicSiteConfigKey, 'hasBl1'>]: DmsmConfig[K]
} & { hasBl1: boolean }

/**
 * R3 — normalize `hasBl1` to a boolean.
 *
 * The wire carries `boolean | string` across 145/211 bl2 sites. True on `true`, and on
 * `"true"`/`"1"`/`"yes"` case-insensitively after trimming. False on everything else, absence
 * included.
 */
export function normalizeHasBl1(value: boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false

  return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
}

/**
 * R6 — merge the two theme levels, per-site over multiSite, **shallow at the branch level**.
 *
 * For each top-level branch the site's branch replaces the multiSite branch WHOLE, or the multiSite
 * branch is used whole. Branches are never deep-merged: a partially overridden `color` branch
 * missing `primaryTextOver` is a rendering bug, not a fallback.
 *
 * ## The branch set is the UNION of both legs, not a fixed list
 *
 * An earlier revision built the result from the eight branches named in `SiteTheme`, which silently
 * dropped anything else. That was wrong twice over. `app/utils/resolve-theme.js` (`collectGroups`,
 * :291) unions its contract groups with whatever groups each leg actually carries, `SiteTheme`'s own
 * JSDoc states unknown groups are pass-through **by design**, and dmsm forwards `config.theme`
 * whole. Worse, p02-01's registry merge preserves unknown branches, so an enumerated merge here
 * would hand p03-01 two different themes for one site depending on which code path produced it.
 *
 * Precedence stays per-branch `??`, so a branch the site defines wins whole (176/211 observed sites
 * carry a per-site theme) and an absent one falls back to the network default.
 *
 * ## Why the name is not `mergeTheme`
 *
 * p02-01 has its own `mergeTheme` in this same directory taking `(multiSiteTheme, siteTheme)` —
 * the INVERTED argument order, with both parameters typed `SiteTheme | undefined`, so confusing
 * them would invert precedence with no type error. That function is module-private today, so the
 * two cannot actually be mixed up by import; the distinct name is cheap insurance for the phase-03
 * merge, when both land in one module and the private one may be exported.
 *
 * Returns `undefined` when neither level defines a theme, so the output carries no empty husk.
 */
export function mergeThemeForProjection(
  siteTheme: SiteTheme | undefined,
  multiSiteTheme: SiteTheme | undefined
): SiteTheme | undefined {
  if (!siteTheme && !multiSiteTheme) return undefined

  const site = (siteTheme ?? {}) as Record<string, unknown>
  const multiSite = (multiSiteTheme ?? {}) as Record<string, unknown>
  const branches = new Set([...Object.keys(multiSite), ...Object.keys(site)])

  const merged: Record<string, unknown> = {}
  for (const branch of branches) merged[branch] = site[branch] ?? multiSite[branch]

  return merged as SiteTheme
}

/**
 * Build the public config payload for one site.
 *
 * Every key below is named on purpose. Nothing is spread, copied, or filtered: the only way a
 * value reaches the wire is an assignment written here against a key in
 * `PUBLIC_SITE_CONFIG_KEYS`.
 *
 * ## No runtime shape validation, deliberately
 *
 * `hideHomePageWidgets`, `i18n` and `scbd` are assigned straight through with no runtime check that
 * they hold the shape their type claims. That is the intended boundary: this function's job is
 * KEY-level containment (what may ship), and value-level validation belongs to the registry reader
 * that parses the row — p02-01's `mapSiteRow`, which already fails loudly on a malformed row.
 * Duplicating it here would either throw on data the registry accepted, or coerce silently, and a
 * second disagreeing validator is worse than one. The leak assertion covers the security half.
 *
 * @param site the per-site registry record, pre-filter (carries `meta`, `smtpCredentials`, ...)
 * @param multiSiteConfig the multiSite `config` block, pre-filter (carries every never-ship secret)
 */
export function toPublicConfig(
  site: SiteConfigInput,
  multiSiteConfig: MultiSiteConfigInput
): SiteConfig {
  return {
    siteCode: site.siteCode,
    multiSiteCode: site.multiSiteCode,
    name: site.name,
    description: site.description,
    host: site.host,
    published: site.published,
    logo: site.logo,
    defaultLocale: site.defaultLocale,
    locales: site.locales,
    country: site.country,
    countries: site.countries,
    continent: site.continent,
    region: site.region,
    env: site.env,
    theme: mergeThemeForProjection(site.theme, multiSiteConfig.theme),
    hasBl1: normalizeHasBl1(site.hasBl1),
    geoBonPage: site.geoBonPage,
    hideHomePageWidgets: site.hideHomePageWidgets,
    migrated: site.migrated,
    i18n: site.i18n,
    scbd: site.scbd
  }
}
