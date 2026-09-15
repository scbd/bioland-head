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
 * @param tier - `api` (direct hit), `tr` (translation) or `fb` (degraded).
 */
export function buildLabelKey(tier: CacheTier, id: string, locale: string): string {
  return `label:${tier}:${LABEL_CACHE_VERSION}:${id}:${locale}`;
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

let aliasMaps: Record<string, string>[] | null = null;
let aliasLoad: Promise<void> | null = null;

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
    } catch {
      /* no asset storage (unit tests, exotic preset) — stay an identity function */
    }
    aliasMaps = maps;
  })();
  await aliasLoad;
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
 * @returns The canonical identifier, or the input unchanged when no alias matches.
 */
export function resolveAlias(identifier: string): string {
  if (!identifier || !aliasMaps) return identifier;
  for (const map of aliasMaps) {
    const mapped = map?.[identifier];
    if (typeof mapped === 'string' && mapped) return mapped;
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
async function writeTier(
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
 * @returns One entry per valid requested id, keyed by the id **as requested** (not its canonical alias).
 */
export async function resolveTerms(
  ids: string[],
  locale: string,
  event?: H3Event
): Promise<Record<string, ResolvedLabel>> {
  const resolved: Record<string, ResolvedLabel> = {};
  if (!Array.isArray(ids) || ids.length === 0) return resolved;

  const loc = typeof locale === 'string' && locale.trim() ? locale.trim() : 'en';
  const requested = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (requested.length === 0) return resolved;

  const now = Date.now();
  const storage = labelStorage();
  await loadAliasMaps();

  // Pass 1 — cache. `canonical` maps each still-unresolved canonical id to the requested ids wanting it,
  // since two aliases can collapse onto the same canonical term.
  const canonical = new Map<string, string[]>();
  for (const id of requested) {
    try {
      let hit: ResolvedLabel | null = null;
      for (const tier of READ_TIERS) {
        hit = await readTier(storage, tier, id, loc, now);
        if (hit) break;
      }
      if (hit) {
        resolved[id] = hit;
        continue;
      }
      const canonicalId = resolveAlias(id);
      const waiting = canonical.get(canonicalId);
      if (waiting) waiting.push(id);
      else canonical.set(canonicalId, [id]);
    } catch {
      await degrade(storage, id, loc, now, resolved);
    }
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
        const value = pickLabel(item, loc);
        if (value) {
          resolved[id] = { value, source: 'api' };
          await writeTier(storage, 'api', id, loc, resolved[id], now + ONE_YEAR_MS);
          continue;
        }
        // The term resolved but this locale is not covered — serve English, and keep the entry short-lived
        // so the label upgrades as soon as the thesaurus (or p04-01's translator) covers the locale.
        const english = pickLabel(item, 'en');
        if (english) {
          resolved[id] = { value: english, source: 'fallback' };
          await writeTier(storage, 'fb', id, loc, resolved[id], now + ONE_MINUTE_MS);
          continue;
        }
        await degrade(storage, id, loc, now, resolved);
      } catch {
        await degrade(storage, id, loc, now, resolved);
      }
    }
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
    consola.warn('resolveTerms: batch fetch failed', { count: canonicalIds.length });
  }
  return byIdentifier;
}

/** D5's degraded outcome: warn with the identifier and locale only, serve the raw id, cache it briefly. */
async function degrade(
  storage: ReturnType<typeof useStorage> | null,
  identifier: string,
  locale: string,
  now: number,
  into: Record<string, ResolvedLabel>
): Promise<void> {
  consola.warn('resolveTerms: unresolved identifier', { identifier, locale });
  into[identifier] = { value: identifier, source: 'identifier' };
  await writeTier(storage, 'fb', identifier, locale, into[identifier], now + ONE_MINUTE_MS);
}
