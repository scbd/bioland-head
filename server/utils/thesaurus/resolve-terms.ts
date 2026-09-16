/**
 * Batch thesaurus label resolution with per-outcome cache lifetimes (D6).
 *
 * ⚠ TTL-no-op finding (p02-01, verified empirically 2026-09-15 against `unstorage@1.17.3`):
 * neither the `fs` driver nor the default memory driver honours the `{ ttl }` option passed to
 * `setItem` — a key written with `ttl: 1` is still readable 1.5s later on both. `useStorage('thesaurus')`
 * is not a named Nitro mount either (`nuxt.config.ts` names only `cache`), so it resolves to the default
 * memory driver. The `{ ttl: CACHE_TTL.ONE_YEAR }` passed at `server/utils/thesaurus/index.js:359` is
 * therefore inert. Consequence for this module: every stored envelope carries an explicit `expiresAt`
 * epoch-ms and the read path treats `now > expiresAt` as a miss, so TTL is enforced in code rather than
 * delegated to the driver. `defineCachedFunction` is deliberately not used — it carries a single `maxAge`
 * and cannot express the three per-outcome lifetimes below (D6).
 *
 * Storage shape (all under `useStorage('thesaurus')`):
 *
 * | key                          | written on                  | lifetime |
 * |------------------------------|-----------------------------|----------|
 * | `label:api:{V}:{id}:{locale}` | direct thesaurus hit        | 1 year   |
 * | `label:tr:{V}:{id}:{locale}`  | seeding / machine translation (p03-01, p04-01 — read-only here) | 6 months |
 * | `label:fb:{V}:{id}:{locale}`  | any degraded outcome        | 1 minute |
 *
 * Read order is `api` → `tr` → `fb` → resolve fresh, so a thesaurus value that newly gains coverage for a
 * locale wins immediately instead of being shadowed by an older translation.
 */
import type { H3Event } from 'h3';
import { CACHE_TTL } from '#shared/utils/constants';
import { dataSourceConfigs } from './config';
import { enqueueTranslation } from './translation-queue';

/**
 * Provenance of a resolved label.
 *
 * - `api`         — the thesaurus itself supplied a value for the requested locale.
 * - `translation` — a machine translation or seeded value (written by p03-01 / p04-01, never here).
 * - `fallback`    — the term resolved, but not in the requested locale; the English value is served.
 * - `identifier`  — the term did not resolve at all; the raw identifier is served (D5).
 */
export type LabelSource = 'api' | 'translation' | 'fallback' | 'identifier';

/** A resolved label plus where its value came from. */
export interface ResolvedLabel {
  value: string;
  source: LabelSource;
}

/** The cached envelope: a {@link ResolvedLabel} plus the explicit expiry the drivers will not enforce. */
interface StoredLabel extends ResolvedLabel {
  expiresAt: number;
}

/**
 * Cache-namespace version. Every stored key embeds it, so **bumping this constant evicts every
 * previously stored label** in one step — that is D6's whole invalidation story (no admin route,
 * no auth surface). Prior-version keys simply become unreachable and age out with their mount.
 */
export const LABEL_CACHE_VERSION = 1;

/** Cache tiers, in read-precedence order. */
type CacheTier = 'api' | 'tr' | 'fb';
const READ_TIERS: readonly CacheTier[] = ['api', 'tr', 'fb'] as const;

const STORAGE_GROUP = 'thesaurus';
const ONE_YEAR_MS = CACHE_TTL.ONE_YEAR * 1000;
const ONE_MINUTE_MS = CACHE_TTL.ONE_MINUTE * 1000;

/**
 * Default label-field preference (D17): the compact display form first, then the long form, then the
 * plain-English `name`. `shortTitle` is frequently `{}` (21/109 `regions` terms, and absent entirely on
 * `CBD-SUBJECT-BIOMES`), so the fallthrough is load-bearing, not decorative.
 */
export const DEFAULT_LABEL_FIELDS: readonly string[] = ['shortTitle', 'title', 'name'] as const;

/**
 * Per-domain label-field preference (D17). Reads an optional `labelFields` array off the domain's entry in
 * `dataSourceConfigs`, falling back to {@link DEFAULT_LABEL_FIELDS}. `shortTitle` is not uniformly the
 * better label — in `regions` it is an internal abbreviation (`AFR – Middle` vs `Africa - Middle Africa`),
 * so those domains declare `labelFields: ['title', 'shortTitle', 'name']` in their own config entry rather
 * than having the order hard-coded here.
 *
 * @param domain - A `dataSourceConfigs` key, e.g. `regions`. Unknown or omitted → the default order.
 */
export function labelFieldOrder(domain?: string): readonly string[] {
  if (!domain) return DEFAULT_LABEL_FIELDS;
  const configs = dataSourceConfigs as Record<string, { labelFields?: string[] } | undefined>;
  const configured = configs[domain]?.labelFields;
  return Array.isArray(configured) && configured.length > 0 ? configured : DEFAULT_LABEL_FIELDS;
}

/**
 * Build a cache key. Exported so tests and sibling tasks address the same namespaces rather than
 * re-deriving the format.
 *
 * ⚠ **`id` and `locale` are percent-encoded, and that is load-bearing, not cosmetic.** `:` is both this
 * key's field separator and a legal character inside an identifier or a locale tag, so the raw form lets
 * `('a:b', 'c')` and `('a', 'b:c')` collide on one key — one term reading or overwriting another term's
 * cached label. `unstorage@1.17.3` widens the hole further by folding `/` and `\` into `:` at the driver
 * boundary. `encodeURIComponent` escapes all three (`%3A`, `%2F`, `%5C`) and is injective, so distinct
 * `(tier, id, locale)` triples can no longer produce the same key. Plain identifiers and locale tags
 * (`GBF-GOAL-A`, `en`) are unaffected, so keys stay readable in a cache dump.
 *
 * @param tier - `api` (direct hit), `tr` (translation) or `fb` (degraded).
 */
export function buildLabelKey(tier: CacheTier, id: string, locale: string): string {
  return `label:${tier}:${LABEL_CACHE_VERSION}:${encodeURIComponent(id)}:${encodeURIComponent(locale)}`;
}

/**
 * Server-assets prefix holding the alias maps — `server/assets/thesaurus-aliases/*.json`.
 *
 * ⚠ Not `import.meta.glob`, and not an `fs` scan. Verified empirically 2026-09-15 by building this repo
 * with a probe route: **Nitro does not transform `import.meta.glob`** — it rewrites it to
 * `globalThis._importMeta_.glob(...)`, which is undefined in the built server, so the module would throw
 * on load. An `fs.readdirSync` of `server/utils/thesaurus/aliases/` is no better: that directory is not
 * copied into `.output/server`, so it would work in dev and silently resolve nothing in production.
 * `server/assets/**` *is* bundled (each file becomes a chunk under `.output/server/chunks/raw/`) and is
 * readable through `useStorage('assets:server')` — confirmed end to end against the built server.
 */
const ALIAS_ASSET_PREFIX = 'thesaurus-aliases';

/**
 * Identifier shape accepted by the alias seam (and, transitively, by everything downstream of it).
 *
 * Thesaurus identifiers are GUIDs or dash-separated slugs (`GBF-TARGET-01`, `CBD-SUBJECT-BIOMES`, `be`).
 * An alias value reaches a thesaurus API **path segment** and a cache key, so the seam validates rather
 * than trusting whatever a caller — from p02-02 onward, untrusted HTTP input — hands it.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * `consola` is a Nitro auto-import, not a static import, so it can be absent (unit harness, exotic preset)
 * and a bare call would throw a `ReferenceError` — from inside {@link degrade}, which is the never-throw
 * guarantee's own recovery path. Every log in this module goes through here.
 */
function warn(message: string, payload?: Record<string, unknown>): void {
  try {
    (globalThis as { consola?: { warn?: (...args: unknown[]) => void } }).consola?.warn?.(message, payload);
  } catch {
    /* logging must never be the thing that breaks resolution */
  }
}

let aliasMaps: Record<string, string>[] | null = null;
let aliasLoad: Promise<void> | null = null;
let aliasWarned = false;

/**
 * Load every alias map once. Idempotent and never throws — a failure leaves {@link resolveAlias} as the
 * identity function. {@link resolveTerms} awaits this before resolving; call it first if you use
 * {@link resolveAlias} standalone.
 */
export async function loadAliasMaps(): Promise<void> {
  if (aliasMaps) return;
  aliasLoad ??= (async () => {
    const maps: Record<string, string>[] = [];
    try {
      const storage = useStorage('assets:server');
      for (const key of await storage.getKeys(ALIAS_ASSET_PREFIX)) {
        if (!key.endsWith('.json')) continue;
        try {
          const raw = await storage.getItem(key);
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed && typeof parsed === 'object') maps.push(parsed as Record<string, string>);
        } catch {
          /* one unreadable map must not disable the rest */
        }
      }
      // Only a clean enumeration memoizes. An empty directory legitimately yields `[]`.
      aliasMaps = maps;
    } catch {
      // An asset-store failure is transient, not proof that no maps exist. Memoizing `[]` here would make
      // `resolveAlias` the identity function for the whole process lifetime off one bad read, silently
      // un-aliasing every later request. Leave the memo unset so the next call retries; warn once so the
      // retry loop is visible without flooding the log. No payload — the error can carry a filesystem path.
      if (!aliasWarned) {
        aliasWarned = true;
        warn('resolveTerms: alias maps unavailable, aliasing disabled until the next successful load');
      }
    }
  })();
  try {
    await aliasLoad;
  } finally {
    if (!aliasMaps) aliasLoad = null;
  }
}

/**
 * Alias-lookup seam: map a caller-supplied identifier to its canonical thesaurus identifier.
 *
 * Alias maps are **dropped in as individual JSON files** under `server/assets/thesaurus-aliases/` — one
 * uniquely-named file per map (`sdg.json`, `iso2-countries.json`, …). There is no registry file to edit, so
 * sibling tasks add maps without touching this module and without conflicting with each other. With no maps
 * present this is a pure identity function.
 *
 * Synchronous by contract: it reads maps that {@link loadAliasMaps} has already cached.
 *
 * Both sides are validated against {@link IDENTIFIER_PATTERN}. This module is the *consumer* the p02-03
 * and p02-04 reviews named: an alias value becomes a thesaurus API path segment and a cache key, so the
 * strict per-domain identifier shape is re-applied here rather than assumed of the caller. A key that does
 * not match is never looked up, and a mapped value that does not match is never returned — so the output
 * is always either the untouched input or a validated canonical identifier.
 *
 * @returns The canonical identifier, or the input unchanged when no valid alias matches.
 */
export function resolveAlias(identifier: string): string {
  if (!identifier || !aliasMaps || !IDENTIFIER_PATTERN.test(identifier)) return identifier;
  for (const map of aliasMaps) {
    const mapped = map?.[identifier];
    if (typeof mapped === 'string' && IDENTIFIER_PATTERN.test(mapped)) return mapped;
  }
  return identifier;
}

/**
 * Pick a label off a thesaurus item for one locale, honouring a field preference order.
 *
 * `title` / `shortTitle` are multilingual objects whose coverage varies 1–6 languages per term, while
 * `name` is a plain English string. A plain string therefore only counts as a match when the requested
 * locale *is* English — otherwise an English `name` would masquerade as a localized value and the
 * `fallback` tier could never trigger.
 *
 * @returns The trimmed value, or `undefined` when no configured field covers this locale.
 */
export function pickLabel(
  item: Record<string, unknown> | null | undefined,
  locale: string,
  fields: readonly string[] = DEFAULT_LABEL_FIELDS
): string | undefined {
  if (!item) return undefined;
  for (const field of fields) {
    const value = fieldValue(item[field], locale);
    if (value) return value;
  }
  return undefined;
}

/** Read one field of a thesaurus item for a locale. See {@link pickLabel} for the plain-string rule. */
function fieldValue(raw: unknown, locale: string): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return locale === 'en' ? raw.trim() || undefined : undefined;
  if (typeof raw !== 'object') return undefined;
  const value = (raw as Record<string, unknown>)[locale];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** `useStorage` itself can throw when no mount is available; degrade to an uncached path instead. */
function labelStorage(): ReturnType<typeof useStorage> | null {
  try {
    return useStorage(STORAGE_GROUP);
  } catch {
    return null;
  }
}

/**
 * Locale allowlist gate for background translation (p04-01 security fix, BL-1004).
 *
 * `enqueueTranslation` drives a billed AWS Translate call, and this function's `loc` argument is
 * caller-supplied with only a `.trim()` (see {@link resolveTerms}). Without a gate, an unauthenticated
 * caller can walk every `(id, locale)` pair through a real AWS call — not `checkSupportedLocales`
 * (`server/utils/translate/index.js`), which only proves AWS *can* translate a locale, so it still lets
 * a caller sweep across all ~75 AWS-supported languages. What actually bounds the blast radius is the
 * requesting site's own configured locale list ({@link SiteContext.locales}, sourced from DMSM
 * `bioland.settings` and typically far narrower than AWS's catalogue) — a locale the site never serves
 * has no legitimate reason to be translated on its behalf. `checkSupportedLocales` is reused instead as
 * the defense-in-depth gate inside `enqueueTranslation` itself, where "is this an AWS-supported locale"
 * is exactly the right question (see `translation-queue.ts`).
 *
 * Fails closed: no `event` (a direct/unit-test caller) or a `useRequestContext` failure both resolve to
 * `false` rather than guessing a locale is fine — `01.context.ts` middleware has already resolved and
 * cached `event.context.site` for every real request, so this is a cache hit, not a fresh DMSM fetch.
 */
async function isLocaleAllowedForSite(event: H3Event | undefined, locale: string): Promise<boolean> {
  if (!event) return false;
  try {
    const ctx = await useRequestContext(event);
    return Array.isArray(ctx?.locales) && ctx.locales.includes(locale);
  } catch {
    return false;
  }
}

/** Read one tier. Returns `null` on a miss, an expired envelope, a malformed envelope, or any error. */
async function readTier(
  storage: ReturnType<typeof useStorage> | null,
  tier: CacheTier,
  id: string,
  locale: string,
  now: number
): Promise<ResolvedLabel | null> {
  if (!storage) return null;
  try {
    const raw = await storage.getItem(buildLabelKey(tier, id, locale));
    const stored = (typeof raw === 'string' ? JSON.parse(raw) : raw) as StoredLabel | null;
    if (!stored || typeof stored.value !== 'string' || typeof stored.expiresAt !== 'number') return null;
    // Expiry is enforced here, never by the driver — see the TTL-no-op finding at the top of this file.
    // The boundary is exclusive: `now === expiresAt` is still a hit.
    if (now > stored.expiresAt) return null;
    return { value: stored.value, source: stored.source };
  } catch {
    return null;
  }
}

/** Write one tier, write-behind style. A storage failure must never surface to the caller. */
export async function writeTier(
  storage: ReturnType<typeof useStorage> | null,
  tier: CacheTier,
  id: string,
  locale: string,
  label: ResolvedLabel,
  expiresAt: number
): Promise<void> {
  if (!storage) return;
  try {
    await storage.setItem(buildLabelKey(tier, id, locale), { ...label, expiresAt } satisfies StoredLabel);
  } catch {
    /* cache writes are best-effort; a failed write only costs a re-resolve */
  }
}

/**
 * Resolve a batch of thesaurus identifiers to localized labels.
 *
 * Per id: read `api` → `tr` → `fb` (treating `now > expiresAt` as a miss), then on a full miss map the id
 * through {@link resolveAlias} and batch every still-missing canonical id through the existing
 * `getThesaurusByKey`.
 *
 * ⚠ **Results are matched back by `.identifier`, never by array position.** `getThesaurusByKey` filters
 * failed promises out of its result array (`server/utils/thesaurus/index.js:77-87`), so a batch of 10 with
 * 2 failures returns an 8-element array whose indices no longer line up with the requested ids. Indexing
 * into it would silently hand terms each other's labels.
 *
 * **Never throws** — for any input, including a malformed or empty `ids`. Every per-id cache read, cache
 * write and label pick is isolated, and an unresolvable id degrades to `{ value: id, source: 'identifier' }`
 * with a warning carrying only the identifier and the locale (D5).
 *
 * @param ids    - Thesaurus identifiers (GUIDs or slugs). Non-string and empty entries are ignored.
 * @param locale - Requested locale code, e.g. `fr`.
 * @param event  - Optional H3 event, forwarded to `getThesaurusByKey` for its request-scoped cache.
 * @param domain - Optional `dataSourceConfigs` key selecting that domain's D17 `labelFields` order. Omitted
 *                 → {@link DEFAULT_LABEL_FIELDS}. ⚠ The cache key does **not** include the domain, so a
 *                 caller must use one consistent domain per identifier; identifiers are domain-scoped in
 *                 practice (`REGION-*`, `GBF-TARGET-*`), so this costs nothing and keeps keys short.
 * @returns One entry per valid requested id, keyed by the id **as requested** (not its canonical alias).
 */
export async function resolveTerms(
  ids: string[],
  locale: string,
  event?: H3Event,
  domain?: string
): Promise<Record<string, ResolvedLabel>> {
  // Null-prototype: every key below is caller-supplied (untrusted HTTP input from p02-02 onward). On a
  // plain object literal `resolved['__proto__'] = …` mutates the prototype instead of adding an own
  // property, so the entry silently vanishes from the result and the returned object's prototype is
  // re-pointed — breaking the documented one-entry-per-valid-id contract. `Object.create(null)` has no
  // `__proto__` setter, so such an id becomes an ordinary own key like any other.
  const resolved: Record<string, ResolvedLabel> = Object.create(null);
  try {
    if (!Array.isArray(ids) || ids.length === 0) return resolved;

    const loc = typeof locale === 'string' && locale.trim() ? locale.trim() : 'en';
    const fields = labelFieldOrder(domain);
    const requested = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if (requested.length === 0) return resolved;

    const now = Date.now();
    const storage = labelStorage();
    await loadAliasMaps();

    // Computed at most once per call, and only if a fallback branch below actually needs it — most
    // calls resolve every id from cache or the `api` tier and never reach the translation seam.
    let localeAllowed: Promise<boolean> | undefined;
    const getLocaleAllowed = (): Promise<boolean> => (localeAllowed ??= isLocaleAllowedForSite(event, loc));

    // Pass 1 — cache. Reads fan out across ids (this sits on the SSR critical path from p02-06 on, and the
    // sequential form cost up to 3N round trips before the batch fetch could even start); the tiers stay
    // ordered per id so a hit on `api` never pays for a `tr`/`fb` read.
    const cacheHits = await Promise.all(
      requested.map(async (id): Promise<ResolvedLabel | null> => {
        // `readTier` is total — every failure mode inside it already resolves to `null`.
        for (const tier of READ_TIERS) {
          const hit = await readTier(storage, tier, id, loc, now);
          if (hit) return hit;
        }
        return null;
      })
    );

    // `canonical` maps each still-unresolved canonical id to the requested ids wanting it, since two
    // aliases can collapse onto the same canonical term. Built in `requested` order so the batch call's
    // argument order stays deterministic.
    const canonical = new Map<string, string[]>();
    for (const [index, id] of requested.entries()) {
      const hit = cacheHits[index];
      if (hit) {
        resolved[id] = hit;
        continue;
      }
      let canonicalId: string;
      try {
        canonicalId = resolveAlias(id);
      } catch {
        await degrade(storage, id, loc, now, resolved);
        continue;
      }
      const waiting = canonical.get(canonicalId);
      if (waiting) waiting.push(id);
      else canonical.set(canonicalId, [id]);
    }
    if (canonical.size === 0) return resolved;

    // Pass 2 — one batch fetch for everything still missing.
    const byIdentifier = await fetchByIdentifier([...canonical.keys()], event);

    for (const [canonicalId, requestedIds] of canonical) {
      const item = byIdentifier.get(canonicalId) ?? byIdentifier.get(canonicalId.toLowerCase());
      for (const id of requestedIds) {
        try {
          if (!item) {
            await degrade(storage, id, loc, now, resolved);
            continue;
          }
          const value = pickLabel(item, loc, fields);
          if (value) {
            resolved[id] = { value, source: 'api' };
            await writeTier(storage, 'api', id, loc, resolved[id], now + ONE_YEAR_MS);
            continue;
          }
          // The term resolved but this locale is not covered — serve English, and keep the entry short-lived
          // so the label upgrades as soon as the thesaurus (or p04-01's translator) covers the locale.
          const english = pickLabel(item, 'en', fields);
          if (english) {
            resolved[id] = { value: english, source: 'fallback' };
            await writeTier(storage, 'fb', id, loc, resolved[id], now + ONE_MINUTE_MS);
            // Gated on the requesting site's own configured locales (BL-1004) — see
            // isLocaleAllowedForSite's doc comment for why the site allowlist, not
            // checkSupportedLocales, is the right gate here. Fire-and-forget: enqueueTranslation's
            // contract guarantees it never rejects, so this never needs an await or a .catch() — see
            // translation-queue.ts (p04-01).
            if (await getLocaleAllowed()) {
              void enqueueTranslation(id, loc, english);
            }
            continue;
          }
          await degrade(storage, id, loc, now, resolved, 'resolveTerms: no usable label field');
        } catch {
          await degrade(storage, id, loc, now, resolved);
        }
      }
    }
  } catch {
    // Belt and braces for the never-throw guarantee: input normalisation, `loadAliasMaps` and the batch
    // fan-out all sit outside the per-id isolates above. Whatever was resolved before the fault is served.
  }

  return resolved;
}


/**
 * Batch-fetch through the existing `getThesaurusByKey` and index the results by `.identifier`.
 * Returns an empty map on any failure — callers degrade rather than throw.
 */
async function fetchByIdentifier(
  canonicalIds: string[],
  event?: H3Event
): Promise<Map<string, Record<string, unknown>>> {
  const byIdentifier = new Map<string, Record<string, unknown>>();
  try {
    const results = await getThesaurusByKey(event, canonicalIds);
    if (!Array.isArray(results)) return byIdentifier;
    for (const item of results) {
      // `[false]` is this fetcher's "nothing resolved" sentinel.
      const identifier = item && typeof item === 'object' ? (item as { identifier?: unknown }).identifier : null;
      if (typeof identifier !== 'string' || !identifier) continue;
      byIdentifier.set(identifier, item as Record<string, unknown>);
      const lower = identifier.toLowerCase();
      if (!byIdentifier.has(lower)) byIdentifier.set(lower, item as Record<string, unknown>);
    }
  } catch {
    warn('resolveTerms: batch fetch failed', { count: canonicalIds.length });
  }
  return byIdentifier;
}

/**
 * D5's degraded outcome: warn with the identifier and locale only, serve the raw id, cache it briefly.
 *
 * @param message - Why we degraded. Defaults to the 404 wording; the "resolved but no usable field" caller
 *                  passes its own so a triage log distinguishes a missing term from an empty one.
 */
async function degrade(
  storage: ReturnType<typeof useStorage> | null,
  identifier: string,
  locale: string,
  now: number,
  into: Record<string, ResolvedLabel>,
  message = 'resolveTerms: unresolved identifier'
): Promise<void> {
  warn(message, { identifier, locale });
  into[identifier] = { value: identifier, source: 'identifier' };
  await writeTier(storage, 'fb', identifier, locale, into[identifier], now + ONE_MINUTE_MS);
}
