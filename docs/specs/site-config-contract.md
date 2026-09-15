---
type: spec
scope: feature
feature: config-endpoint
status: draft
owner: Randy Houlahan
references: [docs/prd.md, docs/architecture.md, docs/CONTEXT.md]
date: 2026-09-15
---

# Site config contract

## Context & Scope

`bioland-head` cannot render a page without `GET /api/config/{env}/{multiSiteCode}/{siteCode}` on
dmsm. The `config-endpoint` plan retires that call: each deployment reads its own registry, and
`drupal-module-bioland` serves the Drupal-owned settings over HTTP instead of dmsm reaching into each
site's MySQL.

This spec pins two contracts so later tasks do not each re-derive them:

1. **The registry read shape** — every key dmsm's site route can return today, at all three levels,
   with its type, its optionality, its owning level, and whether it is public or secret.
2. **The Drupal config document** — the shape `drupal-module-bioland` will serve and the head will
   consume, with a machine-checkable example both sides assert against.

The inventory below was derived from reader code (`dmsm/server/utils/config/index.js`, the
`[siteCode]/index.get.js` route) plus a structure-only extraction of one env file — key names, types
and presence counts, with every scalar replaced by its type. No value was read.

**Observed corpus:** one env file, two multiSites — `bsl` (11 sites) and `bl2` (211 sites). `www2`
is absent. Presence counts below are against that corpus.

## Goals

- Name every key the current site response can carry, so the replacement projection is an explicit
  include-list rather than a filter-down.
- Name every key that must never reach a browser, so the leak surface is enumerable.
- Pin the Drupal document shape, with one example document p02-04 serves and p02-05 consumes.
- Pin the allowed-difference list the parity gate judges against.

## Non-Goals

- No registry schema, no DDL, no seeder. That is p02-01 and p02-02.
- No projection code. That is p02-03.
- No decision on degraded mode, DB topology, backup posture, or soak thresholds. Those are p01-06.
- No `DmsmConfig` type edit. This spec names the successor shape; p01-02 writes it.
- No change to `fetchDmsmConfigCore()` or either of its two callers.
- Nothing here is imported by anything on the request path.

## Scenarios

1. **A public page render.** Anonymous request resolves a site. The projection must supply locale,
   host, theme and identity, and must carry no credential, no infra path, and no staff email.
2. **A projection author (p02-03).** Needs to know which keys to include, which never to include,
   and which two levels a key can come from.
3. **A parity run (p03-01).** Diffs registry payload against dmsm payload across every site and env
   and must know which differences are expected before it can fail on the rest.
4. **A Drupal document consumer (p02-05).** Fetches the module's config document and must reject a
   malformed one loudly rather than serving a half-populated site.

## Interfaces & Contracts

### Level 1 — multiSite `config`

One object per multiSite. Ships only where a key is listed in `publicMultiSiteProperties`
(`multiSiteCode`, `name`, `description`, `baseHost`, `settings`, `theme`); everything else is
stripped before the anonymous response.

| Key | Type | Present | Public |
|---|---|---|---|
| `multiSiteCode` | string | 2/2 | yes |
| `name` | string | 2/2 | yes |
| `description` | string | 2/2 | yes |
| `baseHost` | string | 2/2 | yes |
| `theme` | object | 2/2 | yes |
| `settings` | — | **0/2** | allowlisted, never observed |
| `prePublishedBaseHost` | string | 2/2 | no |
| `cdn` | string | 2/2 | no |
| `gaiaApi` | string | 2/2 | no |
| `dmsmApi` | string | 2/2 | no |
| `drupalImageName` / `headImageName` | string | 2/2 | no |
| `drupalImageVersion` / `headImageVersion` | string | 2/2 | no |
| `showBl1Link` | boolean | 1/2 (bl2) | no |
| `panoramaKey` | string | 1/2 (bl2) | **secret** |
| `dataBase` | object | 2/2 | **secret** |
| `dns` | object | 2/2 | **secret** |
| `drupal` | object | 2/2 | **secret** |
| `auth` | object | 2/2 | **secret** |
| `defaultSmtpCredentials` | object | 2/2 | **secret** |
| `meta` | object | 2/2 | **PII** |

`config.theme` sub-keys: `color`, `hero`, `text`, `backGround`, `megaMenu`, `homePageWidgets`,
`i18n` (`{maxLangBeforeWrap: number}`), and on `bsl` only `canAutoTranslate: boolean`.

`config.meta` is `{created, updated, createdBy, updatedBy}` where both `*By` are `{email, uid}`.

### Level 2 — per-site

| Key | Type | Present (bl2) | Present (bsl) | Public today |
|---|---|---|---|---|
| `siteCode` | string | 211/211 | 11/11 | yes |
| `multiSiteCode` | string | 211/211 | 11/11 | yes |
| `name` | string | 211/211 | 11/11 | yes |
| `published` | boolean | 211/211 | 11/11 | yes |
| `logo` | string | 211/211 | 11/11 | yes |
| `defaultLocale` | string | 211/211 | 11/11 | yes |
| `locales` | string[] | 211/211 | 11/11 | yes |
| `continent` | string | 211/211 | 11/11 | yes |
| `region` | string | 211/211 | 11/11 | yes |
| `country` | string | 208/211 | 9/11 | yes |
| `countries` | string[] | 170/211 | 11/11 | yes |
| `theme` | object | 176/211 | **0/11** | yes |
| `hideHomePageWidgets` | object `{geobon: boolean}` | 210/211 | 0/11 | yes |
| `hasBl1` | **boolean \| string** | 145/211 | 0/11 | yes |
| `migrated` | boolean | 32/211 | 0/11 | yes |
| `i18n` | **boolean** | 31/211 | 0/11 | yes |
| `scbd` | boolean | 12/211 | 6/11 | yes |
| `host` | string | 9/211 | 0/11 | yes |
| `geoBonPage` | string | 4/211 | 0/11 | yes |
| `description` | string | 2/211 | 0/11 | yes |
| `aliases` | string[] | 211/211 | 11/11 | **stripped** |
| `redirect` | string | 211/211 | 11/11 | **stripped** |
| `hasBl2` | boolean | 98/211 | 0/11 | **stripped** |
| `migratedFailed` | boolean | 1/211 | 0/11 | **stripped** |
| `meta` | object | 1/211 | 0/11 | **stripped (PII)** |
| `smtpCredentials` | object | per-site override | per-site override | **never-ship (secret)** |

`site.theme` carries the same leaf shape as `config.theme` minus `canAutoTranslate`.

`redirect` is stored on every site but is **absent from `publicSiteProperties`**
(`dmsm/server/utils/config/index.js`). This applies to **both** anonymous read paths in the
tracked dmsm source (commit `5dc27a8f2fd787445fda36f4aae65432f5dde542`):

- The per-site route selects `readSitePublic`; `fetchDmsmConfigCore` uses a plain `$fetch`.
- The all-sites route selects `readMultiSitePublic`; `redirect-host-index.ts` fetches it with
  `$fetchBaseOptions`, which supplies no authentication header.
- Both readers call `mapPublicMultiSite`, whose `mapPublicMultiSiteSite` filters site and
  `runTime` keys through the same `publicSiteProperties` list.

The head has consumers for `redirect` in both `buildSiteContext` and the reverse-host index,
which skip/fall back when the key is absent. Their existence does not prove that the public
producer emits it. In this source revision neither public response carries it; authenticated
admin reads are a different contract. This is source evidence, not verification of the deployed
dmsm revision. If deployment differs, reconcile that producer before approving the parity gate;
do not silently introduce a new public field. See the allowed-difference list below.

Site-level `smtpCredentials` is read off the **site** object by `mapRunTimeMultiSiteSite` as the
override for `defaultSmtpCredentials`. R2's `runTime` never-ship list already catches the name, so
there is no leak, but it is an observed per-site key and a successor type must know it exists in
order to exclude it.

### Level 3 — derived `runTime`

`mapRunTimeMultiSiteSite` builds `site.runTime` from the multiSite `config`, then the public
projection filters it through the **site** allowlist. Survivors and casualties:

| `runTime` member | Source | Survives the filter | Class |
|---|---|---|---|
| `env` | derived | yes | public |
| `multiSiteCode` | config | yes | public |
| `host` | site or `${siteCode}.${baseHost}` | yes | public |
| `countries` | site `countries` ∪ `country` | yes | public |
| `theme` | `config.theme` | yes | public |
| `i18n` | `config.i18n` | yes | **always `undefined`** |
| `settings` | `config.settings` | no | **always `undefined`** |
| `cdn` | config | no | internal |
| `baseHost` | config | no | internal |
| `root` | `/opt/{env}/{multiSiteCode}` | no | infra path |
| `drupalRoot` | `${root}/web` | no | infra path |
| `siteRoot` | `${drupalRoot}/sites/{siteCode}` | no | infra path |
| `dataBaseName` | `{multiSiteCode}_{siteCode}` | no | infra |
| `dataBase` | config | no | **secret** |
| `dns` | config | no | **secret** |
| `smtpCredentials` | site or `defaultSmtpCredentials` | no | **secret** |
| `biolandSettings` | Drupal, attached **after** the filter | yes | public-ish |

`runTime.biolandSettings` is assigned by `addBiolandSettings` after `readSitePublic` has already
filtered, so no allowlist governs it on the dmsm side. The head's own
`sanitizeBiolandSettings` (`server/utils/bioland-settings.ts`, BL-890) is the only filter over it
today, and the successor must keep a head-side allowlist for the same reason.

### The Drupal config document

`drupal-module-bioland` MUST serve one JSON document per site. Source keys and their wire names:

| Drupal source | Wire path | Notes |
|---|---|---|
| `bioland.settings` | `config.biolandSettings` | per `config/schema/bioland.schema.yml` |
| `system.site` `name` | `config.systemSite.name` | plus per-language overrides |
| `system.date` `timezone.default` | `config.systemDate.timezone.default` | IANA zone id |

`bioland.settings` top-level keys, per the schema: `countries`, `region`, `continent`,
`is_biosafety_land`, `enable_field_visibility`, `field_visibility`, `enable_additional_fields`,
`additional_tags`, `enable_auto_summary`, `enable_help_comments`, `help_comments`,
`field_visibility_rules`, `config`, `google_analytics_ids`, `enable_debug_logging`,
`debug_log_areas`, `main_menu_lock`, `component_menu_add_enabled`, `component_menu_show_attributes`,
`mega_menu`, `home_widgets`, `translation`, `theme`.

**Rules:**

- The module MUST emit camelCase keys. `google_analytics_ids` MUST arrive as `googleAnalyticsIds`.
  A snake_case top-level key in the document is a contract violation.
- The document MUST carry an integer `version`, starting at `1`. A consumer MUST reject a document
  with a missing, non-integer or non-positive `version` rather than guess.
- The document MUST carry `siteCode` and an ISO-8601 `generated` timestamp. The wire format is
  `YYYY-MM-DDTHH:mm:ss` with optional fractional seconds (`.` followed by one or more digits),
  followed by `Z` or a numeric offset (`±HH:mm` or `±HHmm`). Calendar dates MUST exist, including
  Gregorian leap-year rules; hours are `00`–`23`, minutes and seconds `00`–`59` (also for offset
  hours/minutes respectively). Date-only, timezone-less and locale-dependent date strings are not
  wire timestamps. The example uses UTC; offsets and sub-millisecond fractions remain valid.
- Per-language site names go under `config.systemSite.translations.{langcode}.name`.
- The response MUST be cache-tagged so a config save invalidates it.
- The api key MUST travel in a request header, never `?api-key=`.
- The document MUST NOT carry any key from the never-ship list below, at any depth.

Envelope:

```json
{ "version": 1, "generated": "<ISO-8601>", "siteCode": "<code>",
  "config": { "biolandSettings": {}, "systemSite": {}, "systemDate": {} } }
```

The canonical example is `tests/fixtures/config-contract/drupal-config-document.example.json`;
`validateDrupalConfigDocument` in the sibling `.ts` file is the machine check.

```ts
validateDrupalConfigDocument(doc: unknown): { valid: boolean; errors: string[] }
```

## Behavior & Rules

### R1 — the public projection is an include-list

The replacement projection MUST be built by naming each key it emits. Filter-down — copying the
source object and deleting known-bad keys — is **forbidden**: a key added upstream then ships by
default, and that is exactly how `panoramaKey` and `meta` would escape.

### R2 — never-ship keys

These MUST NOT appear in any public payload, at any level, at any depth.

Secret or PII at the multiSite level: `dataBase`, `dns`, `drupal`, `defaultSmtpCredentials`,
`panoramaKey`, `auth`, and `meta` — `meta` at **both** the multiSite and the site level, since
`createdBy`/`updatedBy` are `{email, uid}` and leak staff emails.

Derived `runTime` members: `root`, `drupalRoot`, `siteRoot`, `dataBaseName`, `smtpCredentials`.

`auth` is not in the task's original six; it is a config-level object holding a service URI and is
listed here for completeness.

### R3 — `hasBl1` normalizes to boolean

`hasBl1` is `boolean | string` across 145/211 bl2 sites. The registry MUST store it as a boolean.
Normalization direction: **string to boolean**, truthy on `"true"`/`"1"`/`"yes"` case-insensitively
after trimming, false on `""`/`"false"`/`"0"`/`"no"`, and false on absence. The projection MUST emit
`hasBl1: boolean` unconditionally, never a string, and never `undefined`.

### R4 — the `i18n` collision

Three things are called `i18n` and only two of them are real:

- Site-level `i18n` is a **boolean** (31/211).
- `config.theme.i18n` and `site.theme.i18n` are `{maxLangBeforeWrap: number}`.
- `runTime.i18n` reads `config.i18n`, which is **not present in the observed corpus**, so
  `runTime.i18n` is `undefined` for every site that corpus covers.

**Certainty — weaker than R5, and the difference matters.** R5 holds *structurally*: `settings` is
absent from `publicSiteProperties`, so `runTime.settings` is stripped in every env regardless of
what any config file contains. R4 holds only *empirically*: `i18n` **is** allowlisted
(`publicSiteProperties`) and **is** destructured into `runTime` by `mapRunTimeMultiSiteSite`, so the
only thing making `runTime.i18n` undefined is that no observed multiSite `config` populates
`i18n` — and the corpus is **one env file** (§ Context & Scope). If prod or dev populates
`config.i18n`, this rule silently drops a live field.

**Resolution:** keep both live names on the wire for parity. Site-level `i18n` stays a boolean at the
site level; the wrap setting stays nested under `theme.i18n` where it already lives. The projection
MUST NOT emit a top-level `runTime.i18n` — **gated on p02-02 confirming `config.i18n` is absent
across all three env files.** If p02-02 finds it populated in any env, this rule is void and
`runTime.i18n` must be carried; p02-03 takes the confirmed answer, not this corpus-derived one.
Renaming either name is a debt row, not this plan's work.

### R5 — `config.settings` and `runTime.settings`

`settings` is in `publicMultiSiteProperties` and is destructured into `runTime`, but it is absent
from the observed corpus, and `settings` is **not** in the site-level allowlist, so it would be
stripped from `runTime` even if present. `runTime.settings` is therefore `undefined` today by two
independent mechanisms.

**Resolution:** the successor MUST NOT emit `runTime.settings`. It is a phantom field. Emitting
`undefined` for it would be indistinguishable from today's behavior but would invite a consumer.
p02-03 records the decision; p04-04 carries the removal of the dead destructure as debt.

### R6 — two-level theme, with precedence

Theme exists at two levels: multiSite `config.theme` (2/2) is the default, per-site `theme` (176/211
bl2, 0/11 bsl) is the override.

**Precedence rule:** per-site wins per top-level theme branch, and the merge is **shallow at the
branch level**. For each of `color`, `hero`, `text`, `backGround`, `megaMenu`, `homePageWidgets`,
`i18n`: if the site defines that branch, the site's branch replaces the multiSite branch whole; if it
does not, the multiSite branch is used whole. Branches are not deep-merged, because a partially
overridden `color` branch with a missing `primaryTextOver` is a rendering bug, not a fallback.

The merge is assigned to **`readSite`** — the registry read, not the projection, not the consumer —
so every reader sees one resolved theme.

Per plan decision 8, this port is **fallback only**: once themeing p03-01 lands, the head resolves
`biolandSettings.theme` first per leaf, and a site with a saved `bioland.settings.theme` is excluded
from theme parity diffs.

### R7 — fail loudly

A malformed config MUST fail loudly. Today `parseJson5` swallows a parse error and returns
`undefined`, and a single bad character silently blanks the whole config. The registry store and the
Drupal document consumer MUST both throw on a malformed input rather than return a partial or empty
result.

### R8 — `google_analytics_ids` MUST be allowlisted

Per the sibling google-analytics plan (BL-170), `googleAnalyticsIds` reaches the head today through
dmsm's unfiltered `bioland.settings` passthrough. Both the projection allowlist and the head-side
`biolandSettings` allowlist MUST list it, or it silently disappears at cutover. Grammar per token:
`^(G|GTM|AW|DC|UA)-[A-Z0-9-]+$`, comma-separated.

## Data Model

### `DmsmConfig` successor

The current `DmsmConfig` (`shared/types/context.ts`) types 10 fields. Code already reads five it
omits, which p01-02 MUST add:

| Field | Type | Why |
|---|---|---|
| `published` | `boolean` | site/pre-published grouping |
| `hasBl1` | `boolean` | normalized per R3 |
| `geoBonPage` | `string` | 4/211 sites |
| `scbd` | `boolean` | CHM network grouping |
| `runTime` members | typed, not `Record<string, unknown>` | `env`, `multiSiteCode`, `host`, `countries`, `theme`, `biolandSettings` |

The full site key list a successor type must cover: `siteCode`, `multiSiteCode`, `name`,
`description`, `host`, `published`, `logo`, `defaultLocale`, `locales`, `country`, `countries`,
`continent`, `region`, `env`, `theme`, `hasBl1`, `hasBl2`, `geoBonPage`, `hideHomePageWidgets`,
`migrated`, `migratedFailed`, `aliases`, `i18n`, `scbd`, `redirect`, `runTime`.

## Acceptance Criteria

1. The example document at `tests/fixtures/config-contract/drupal-config-document.example.json`
   parses as JSON and validates.
2. A document with no `version` fails, with an error naming `version`.
3. A document with no `config.systemSite.name` fails, with an error naming `systemSite.name`.
4. A document carrying a snake_case top-level key inside `config.biolandSettings` fails, with an
   error naming the offending key.
5. A document carrying any never-ship key from R2, at any depth, fails, with an error naming that
   key and its path.
6. `validateDrupalConfigDocument` exports the signature
   `(doc: unknown) => { valid: boolean; errors: string[] }` and adds no dependency.
7. The example document contains no host, no key, no credential, and no real site name.

## Allowed-difference list (parity)

p03-01 diffs registry payload against dmsm payload. p02-10 encodes this table.

**Expected — MUST NOT fail the gate:**

| Difference | Why |
|---|---|
| `biolandSettings` gains `systemSite` and `systemDate` | dmsm's SQL read cannot see them |
| `hasBl1` string becomes boolean | R3 normalization |
| `runTime.settings` absent on both sides | R5 — phantom on both |
| `runTime.i18n` absent on both sides | R4 — `config.i18n` unobserved in the corpus; **provisional until p02-02 confirms all three envs** |
| `redirect` absent on both sides | stripped by `publicSiteProperties` today; the successor does **not** restore it |
| `theme` differs on a site with a saved `bioland.settings.theme` | plan decision 8 |
| key order, whitespace, JSON number formatting | serialization |
| `generated` timestamp | per-response |

**`redirect` — the successor's decision.** The projection MUST NOT emit `redirect`, matching
both public readers in the source revision above. Restoring it is a deliberate, separate change,
not a side effect of the migration: `buildSiteContext` and `redirect-host-index.ts` would begin
acting on a value those public readers strip, and `redirect` is operator-supplied free text that
the canonical-host validator already has to defend against. A requirement to enable custom-domain
routing through this field needs its own producer/consumer change, with the head-side behavior
reviewed on its own merits; it is not evidence that the existing public payload includes the key.

**Fails the gate — no exception:**

| Difference | Why |
|---|---|
| any never-ship key from R2 present on the registry side | the leak this plan exists to close |
| a public key present under dmsm and absent under registry | a silent regression |
| `defaultLocale`, `locales`, `host`, `published` differing | routing and render correctness |
| `redirect` **present** on the registry side | it is stripped today; emitting it is a behavior change, not parity |
| `googleAnalyticsIds` absent under registry | R8 |
| a value-shaped secret: a `-----BEGIN` block, a `mysql://` or `smtp://` URI, a high-entropy string | key-name matching misses `panoramaKey` and cannot catch a credential pasted into a benign admin field |

## Cross-Cutting Concerns

- **Security.** Two-layer leak defence: the projection allowlist (p02-03) plus a head-side
  `biolandSettings` allowlist (p03-02), because `biolandSettings` is attached outside the projection
  and its own allowlist lives in another repo on another deploy cadence. Value-shaped detection is
  required alongside key-name matching.
- **Privacy.** `meta.createdBy` / `meta.updatedBy` are `{email, uid}` at both levels. Staff emails.
- **Observability.** A projection that drops a key silently is the failure mode this spec is written
  against. The parity gate is the detector.

## Alternatives Considered

- **Filter-down instead of include-list.** Rejected — an upstream key addition ships by default.
- **Deep-merging theme branches.** Rejected — a half-overridden branch renders wrong, and the
  observed corpus shows sites overriding whole branches, not leaves.
- **Normalizing `hasBl1` boolean-to-string.** Rejected — consumers read it as a condition.
- **ajv or zod for the validator.** Rejected — no new dependency for a fixture check.

## Open Questions

- Is `www2` a live multiSite needing registry rows? Absent from the observed corpus; p02-02 reports
  what it finds across all three env files.
- Who owns `siteName` — the existing 30-day-TTL `getSiteSettings`, or this document? p02-05 names one
  owner and reconciles the other.
- `config.settings` is allowlisted but never observed. Was it ever populated, or is the allowlist
  entry aspirational? p02-02 confirms across all three envs.
- `config.i18n` is allowlisted and destructured into `runTime`, but never observed in the
  single-env corpus. **p02-02 must confirm across all three env files**, because unlike `settings`
  nothing structural strips it — R4's "MUST NOT emit `runTime.i18n`" is void if any env populates
  it.
