import { consola } from "consola";

import { sanitizeBiolandSettings } from "../bioland-settings";

import type { BiolandSettings, SiteContext } from "#shared/types/context";

/**
 * Client for the Drupal config document (`config-endpoint` plan, p02-05).
 *
 * ## What this is
 *
 * `fetchSiteSettings` is the HTTP replacement for the `bioland.settings` bag dmsm used to read
 * straight out of MySQL. It fetches the versioned config document p02-04 serves, checks it,
 * filters it, persists it as last-known-good, and hands back the `biolandSettings` object p03-02
 * will attach to `runTime`. Nothing calls it yet - it merges dead-but-tested.
 *
 * ## Precedence: fresh > last-known-good > null
 *
 * 1. A fresh 2xx document that passes every check wins, and is stored as last-known-good.
 * 2. On a fetch failure, timeout, or non-2xx, the stored last-known-good document is served with
 *    `stale: true` and a loud `consola.error` naming the site and the reason.
 * 3. With nothing stored, the result is `null`. This function NEVER throws: dmsm read the settings
 *    out of MySQL, so a site's PHP being down never dark-sited it, and a plain HTTP replacement
 *    that threw would be strictly less outage-tolerant. A null config 404s every page
 *    (`context-unified.ts:75-81`), so the caller - not this module - decides what a null means.
 *
 * The `{ settings, stale }` envelope is required: a bare `BiolandSettings | null` cannot tell a
 * caller that what it holds is a last-known-good copy rather than the live truth.
 *
 * ## Last-known-good is NOT a cache
 *
 * It has no TTL and is read on failure only. The config-level `cachedFunction` (5-minute TTL) in
 * `context-unified.ts` already caches the config fetch; a second TTL here would be two truths.
 * Do not merge the two concepts, and do not add a cache layer to this module.
 *
 * ## Version check does not fall back
 *
 * An unexpected `version` is a deploy error - Drupal shipped a shape this client cannot read - not
 * an outage. Serving a last-known-good document in that case would paper over a broken deploy with
 * data of unknown age, so a version mismatch logs loudly and returns `null` without consulting the
 * registry at all.
 *
 * ## The api key is a header, never a query param
 *
 * `drupal/index.js:30` puts the service-account key in the query string, which lands it in access logs,
 * referrers, and CDN cache keys. That convention is deliberately not copied here. The key is read
 * from runtime config and is never logged, not even redacted.
 *
 * ## Second leak layer
 *
 * `biolandSettings` is attached outside the public projection, and the projection's own allowlist
 * lives in another repo on another deploy cadence. This module therefore re-filters what it
 * receives: `sanitizeBiolandSettings` (BL-890) is the key-shaped allowlist, and
 * {@link findLeakInDocument} adds never-ship key names plus VALUE-shaped detection - service URIs,
 * PEM blocks, and high-entropy tokens - because a key-name pattern misses `panoramaKey` and cannot
 * catch a credential a site admin pasted into a benign field such as `helpComments.*`. A document
 * that trips it is neither stored nor returned.
 *
 * ## `siteName` ownership
 *
 * `getSiteSettings` (`drupal/index.js:26-63`, JSON:API, 30-day TTL) keeps ownership of `siteName`
 * and `homePath`. This client deliberately drops `config.systemSite` on the floor and its return
 * type has nowhere to put a site name, so there is exactly one producer. A unit test asserts this
 * client never ships `siteName`, so the boundary is mechanical rather than aspirational.
 *
 * ## Timeout
 *
 * {@link CONFIG_FETCH_TIMEOUT_MS} bounds the request so a hanging Drupal cannot hold a Nitro
 * worker open. A timeout is an outage, so it takes the last-known-good branch.
 *
 * ## Degraded mode while p02-01 is unmerged
 *
 * p02-01 owns the last-known-good column and both its read and write paths; it is a MERGE-ORDER
 * dependency, not a branch parent, so its module is not on this branch. This client therefore takes
 * that store through {@link registerLastKnownGoodPort} and runs FETCH-ONLY until something
 * registers one: fresh documents are still returned, nothing is persisted, and a failure returns
 * `null` instead of a stale document. p02-02's bulk-seed writer is deliberately NOT used - it seeds
 * the registry from dmsm, a different job with a different failure mode - and no second
 * last-known-good writer is authored here.
 */

/**
 * The context slice this client needs. Named to match the plan's published signature; structurally
 * a subset of `SiteContext`, so a full request context satisfies it without a cast.
 */
export type RequestContext = Pick<SiteContext, "siteCode" | "env" | "multiSiteCode"> &
  Partial<Pick<SiteContext, "host" | "localizedHost">>;

/** The envelope p02-04 serves. Only the fields this client reads are typed. */
export interface DrupalConfigDocument {
  version: number;
  generated: string;
  siteCode: string;
  config: {
    biolandSettings?: unknown;
    [key: string]: unknown;
  };
}

/** What gets persisted as last-known-good: already filtered, stamped with version and fetch time. */
export interface LastKnownGoodRecord {
  version: number;
  fetchedAt: string;
  settings: BiolandSettings;
}

/** Registry coordinates for one site's last-known-good row. */
export interface LastKnownGoodKey {
  env: string;
  multiSiteCode: string;
  siteCode: string;
}

/** The result envelope. `stale` is true only when the document came out of last-known-good. */
export interface SiteSettingsResult {
  settings: BiolandSettings;
  stale: boolean;
}

/**
 * The only document version this client can read. `version` is a major: p01-01's contract says a
 * consumer MUST reject a missing or non-integer version rather than guess, and a bumped integer
 * means the shape changed.
 */
export const SUPPORTED_CONFIG_VERSION = 1;

/**
 * Route path and header name are p02-04's to pin; these are the values this client sends and the
 * e2e conformance check is what catches a divergence. Both live here as exported constants so
 * reconciling them on p02-04's merge is a one-line change with a failing test to prove it.
 */
export const CONFIG_DOCUMENT_PATH = "/bioland/config";
export const CONFIG_API_KEY_HEADER = "x-bioland-api-key";

/**
 * Short by design. The shared mariadb pool has `acquireTimeout: 30000`
 * (`translate/index.js:59-71`), so config work that waits tens of seconds pins Nitro workers.
 * Config must degrade fast rather than queue.
 */
export const CONFIG_FETCH_TIMEOUT_MS = 5_000;

/**
 * The slice of p02-01's `server/utils/site-registry/index.ts` this module uses, pinned to that
 * module's real signatures (commit `c1e18f7` on `feature/BL-981-p02-01-registry-schema-and-access`):
 * positional `(env, multiSiteCode, siteCode, …)`, and a read that returns the raw stored JSON
 * object or `null` and THROWS `RegistryRowMissingError` / `RegistryRowMalformedError` /
 * `RegistryUnavailableError` rather than returning a sentinel. Both are treated as untyped data
 * here - the read is re-validated by {@link isLastKnownGoodRecord} - because p02-01's compile-time
 * types are not on this branch.
 */
export interface LastKnownGoodPort {
  writeLastKnownGoodSettings: (
    env: string,
    multiSiteCode: string,
    siteCode: string,
    doc: unknown,
  ) => Promise<void>;
  readLastKnownGoodSettings: (
    env: string,
    multiSiteCode: string,
    siteCode: string,
  ) => Promise<Record<string, unknown> | null>;
}

let registeredPort: Partial<LastKnownGoodPort> | null = null;

/**
 * Register p02-01's registry module as this client's last-known-good store. Unregistered - the
 * state on this branch, where p02-01 is not merged - means degraded, fetch-only operation: nothing
 * is persisted, nothing is served on failure, and `fetchSiteSettings` still returns fresh documents.
 *
 * ## Why registration and not a dynamic `import()`
 *
 * The obvious trick - `import(SOME_PATH_VARIABLE).catch(() => null)` - was tried and REJECTED, and
 * this note exists so nobody re-introduces it. It builds today only because the specifier is a
 * variable, which stops rollup resolving it; Nitro then emits that string verbatim into
 * `.output/server/chunks/nitro/nitro.mjs`, where a source-relative path points nowhere. The import
 * would reject at run time, the `.catch` would swallow it, and last-known-good would be silently
 * dead in production while every test passed. A literal specifier instead fails the build outright
 * (`RollupError: Could not resolve "../site-registry/index"`) while p02-01 is unmerged - verified,
 * not assumed. So there is no import form that both builds now and works later.
 *
 * ## What lights this up when p02-01 merges
 *
 * One edit in the consumer that owns wiring (p03-02): import p02-01's module and pass it here.
 * `writeLastKnownGoodSettings` / `readLastKnownGoodSettings` are structurally what this port wants,
 * so `registerLastKnownGoodPort(await import('../site-registry'))` is the whole change. The unit
 * suite already exercises the live path through a double shaped to p02-01's real signatures, so
 * swapping the double for the module is all that is needed to prove it end to end.
 */
export function registerLastKnownGoodPort(port: Partial<LastKnownGoodPort> | null): void {
  registeredPort = port;
}

const resolveLastKnownGoodPort = (): Partial<LastKnownGoodPort> | null => registeredPort;

/* -------------------------------------------------------------------------------------------- */
/* Leak detection - the second layer                                                              */
/* -------------------------------------------------------------------------------------------- */

/** § R2 never-ship key names, matched case-insensitively at any depth. */
const NEVER_SHIP_KEYS = new Set(
  [
    "dataBase",
    "dataBaseName",
    "dns",
    "drupal",
    "drupalRoot",
    "siteRoot",
    "root",
    "auth",
    "meta",
    "panoramaKey",
    "smtpCredentials",
    "defaultSmtpCredentials",
  ].map((key) => key.toLowerCase()),
);

/** Service URIs that carry credentials in the authority segment. */
const SECRET_URI = /\b(?:mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqps?|smtps?):\/\//i;

/** Any PEM armour - private keys, certificates, encrypted blobs. */
const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]+-----/;

/** Token-shaped: no whitespace, no path separators, no scheme punctuation. */
const TOKEN_CHARSET = /^[A-Za-z0-9+/=_\-.~]+$/;

const HIGH_ENTROPY_MIN_LENGTH = 25;

/**
 * 3.9 bits/char separates random tokens from prose and identifiers: 40-char hex lands near 3.9 and
 * base64 near 4.5, while a UUID (skewed alphabet) sits around 3.5 and a slug lower still. The
 * tradeoff is deliberate and fail-closed - a long random-looking value in a legitimate field costs
 * one escalation, a missed credential ships to every browser.
 */
const HIGH_ENTROPY_BITS = 3.9;

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();

  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);

  let bits = 0;

  for (const count of counts.values()) {
    const probability = count / value.length;

    bits -= probability * Math.log2(probability);
  }

  return bits;
}

function isHighEntropySecret(value: string): boolean {
  if (value.length < HIGH_ENTROPY_MIN_LENGTH) return false;
  if (!TOKEN_CHARSET.test(value)) return false;
  if (!/[0-9]/.test(value) || !/[A-Za-z]/.test(value)) return false;

  return shannonEntropy(value) >= HIGH_ENTROPY_BITS;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Bound the walk so a pathological document cannot blow the stack. */
const MAX_DEPTH = 32;

/**
 * Key-shaped AND value-shaped scan over the whole document, envelope included - a never-ship key
 * parked beside the envelope is exactly the leak this exists to catch.
 *
 * Returns the dotted path and reason of the first finding, or `null` when the document is clean.
 * The offending VALUE is never returned or logged; only where it was found and what shape it had.
 */
export function findLeakInDocument(value: unknown, path = "", depth = 0): string | null {
  if (depth > MAX_DEPTH) return `${path || "<root>"}: nests deeper than ${MAX_DEPTH}`;

  if (typeof value === "string") {
    if (SECRET_URI.test(value)) return `${path}: value looks like a credential-bearing service URI`;
    if (PEM_BLOCK.test(value)) return `${path}: value contains a PEM block`;
    if (isHighEntropySecret(value)) return `${path}: value looks like a high-entropy secret`;

    return null;
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const finding = findLeakInDocument(entry, `${path}[${index}]`, depth + 1);

      if (finding) return finding;
    }

    return null;
  }

  if (!isPlainObject(value)) return null;

  for (const [key, entry] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;

    if (NEVER_SHIP_KEYS.has(key.toLowerCase())) return `${childPath}: never-ship key name`;

    const finding = findLeakInDocument(entry, childPath, depth + 1);

    if (finding) return finding;
  }

  return null;
}

/* -------------------------------------------------------------------------------------------- */
/* Contract checks                                                                                */
/* -------------------------------------------------------------------------------------------- */

/**
 * `config.systemSite.translations` is keyed by BCP-47 langcode (`zh-hans`, `pt-br`, `gsw-berne`),
 * which is legitimately hyphenated. Only that one level is exempt.
 */
const CASING_EXEMPT_PARENTS = new Set(["config.systemSite.translations"]);

/**
 * p02-04 emits camel case already, so this client must NOT re-run the depth-7 camel-case pass - two
 * converters is two truths, and the depth-7 bound silently stops converting below it. Asserting
 * instead means a regression on either side surfaces as a rejected document rather than as keys
 * that quietly stop matching their consumers.
 */
export function findWrongCasedKey(value: unknown, path = "", depth = 0): string | null {
  if (depth > MAX_DEPTH) return null;

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const finding = findWrongCasedKey(entry, `${path}[${index}]`, depth + 1);

      if (finding) return finding;
    }

    return null;
  }

  if (!isPlainObject(value)) return null;

  const exempt = CASING_EXEMPT_PARENTS.has(path);

  for (const [key, entry] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;

    if (!exempt && /[_-]/.test(key)) return childPath;

    const finding = findWrongCasedKey(entry, childPath, depth + 1);

    if (finding) return finding;
  }

  return null;
}

function isConfigDocument(value: unknown): value is DrupalConfigDocument {
  return isPlainObject(value) && isPlainObject(value.config);
}

/* -------------------------------------------------------------------------------------------- */
/* Write-back                                                                                     */
/* -------------------------------------------------------------------------------------------- */

const pendingWriteBacks = new Set<Promise<void>>();

/**
 * Settles every in-flight last-known-good write. The write-back is deliberately off the response
 * critical path, so nothing in the request path awaits it; tests and a graceful shutdown do.
 */
export async function awaitPendingWriteBacks(): Promise<void> {
  await Promise.allSettled([...pendingWriteBacks]);
}

function persistLastKnownGood(key: LastKnownGoodKey, record: LastKnownGoodRecord): void {
  const write = resolveLastKnownGoodPort()?.writeLastKnownGoodSettings;

  // Degraded, fetch-only mode: no port registered, so p02-01's write path is not available.
  // Nothing to persist to, and nothing to warn about on every request - the read side degrades
  // in step.
  if (!write) return;

  // `Promise.resolve().then` rather than a bare call, so a port that throws SYNCHRONOUSLY is
  // caught by the same handler instead of propagating out of a function that must never fail.
  const task = Promise.resolve()
    .then(() => write(key.env, key.multiSiteCode, key.siteCode, record))
    .catch((error: unknown) => {
      // A registry write error must never fail the read: the fresh document is already returned.
      consola.error(
        `[site-settings] last-known-good write failed for ${key.siteCode} (${key.env}/${key.multiSiteCode}): ${errorReason(error)}`,
      );
    });

  pendingWriteBacks.add(task);

  void task.finally(() => pendingWriteBacks.delete(task));
}

/**
 * A row read back out of the registry is re-validated rather than trusted: the column is free-form
 * JSON, it may have been written by an older build of this module, and a malformed record served as
 * settings would be a silent wrong answer. An unreadable record is treated as "nothing stored".
 */
function isLastKnownGoodRecord(value: unknown): value is LastKnownGoodRecord {
  return (
    isPlainObject(value) &&
    Number.isInteger(value.version) &&
    typeof value.fetchedAt === "string" &&
    isPlainObject(value.settings)
  );
}

async function readLastKnownGood(key: LastKnownGoodKey): Promise<LastKnownGoodRecord | null> {
  const port = resolveLastKnownGoodPort();

  if (!port?.readLastKnownGoodSettings) return null;

  try {

    const stored = await port.readLastKnownGoodSettings(key.env, key.multiSiteCode, key.siteCode);

    if (stored === null) return null;

    if (!isLastKnownGoodRecord(stored)) {
      consola.error(
        `[site-settings] stored last-known-good for ${key.siteCode} (${key.env}/${key.multiSiteCode}) is not a readable record; ignoring it.`,
      );

      return null;
    }

    // A record written by an older major is a shape this client cannot read, same as a fresh
    // document of the wrong version - serving it would be guessing.
    if (stored.version !== SUPPORTED_CONFIG_VERSION) {
      consola.error(
        `[site-settings] stored last-known-good for ${key.siteCode} (${key.env}/${key.multiSiteCode}) reports version ${stored.version}; this client reads version ${SUPPORTED_CONFIG_VERSION} only.`,
      );

      return null;
    }

    return stored;
  } catch (error: unknown) {
    // p02-01 throws rather than returning a sentinel: RegistryRowMissingError (no such site),
    // RegistryRowMalformedError (unusable row), RegistryUnavailableError (no answer at all). All
    // three mean "no last-known-good to serve" HERE; p03-02 owns telling absent from unreachable.
    consola.error(
      `[site-settings] last-known-good read failed for ${key.siteCode} (${key.env}/${key.multiSiteCode}): ${errorReason(error)}`,
    );

    return null;
  }
}

/* -------------------------------------------------------------------------------------------- */
/* The client                                                                                     */
/* -------------------------------------------------------------------------------------------- */

/** Error text only - never a response body, which could echo the document back into the log. */
const errorReason = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * Fetch the Drupal config document for `ctx`, filter it, persist it as last-known-good, and return
 * the `biolandSettings` bag.
 *
 * Precedence is fresh > last-known-good > `null`; see the module JSDoc for why last-known-good is
 * not a cache and why a version mismatch refuses to fall back. Never throws.
 */
export async function fetchSiteSettings(ctx: RequestContext): Promise<SiteSettingsResult | null> {
  const key: LastKnownGoodKey = {
    env: ctx.env,
    multiSiteCode: ctx.multiSiteCode,
    siteCode: ctx.siteCode,
  };
  const site = `${key.siteCode} (${key.env}/${key.multiSiteCode})`;
  const { apiKey } = useRuntimeConfig();
  const host = ctx.host || ctx.localizedHost;

  let document: unknown;

  try {
    document = await $fetch(
      `${host}${CONFIG_DOCUMENT_PATH}`,
      $fetchBaseOptions({
        headers: { [CONFIG_API_KEY_HEADER]: apiKey },
        timeout: CONFIG_FETCH_TIMEOUT_MS,
        retry: 1,
      }),
    );
  } catch (error: unknown) {
    consola.error(`[site-settings] config fetch failed for ${site}: ${errorReason(error)}`);

    return serveLastKnownGood(key, site);
  }

  if (!isConfigDocument(document)) {
    consola.error(`[site-settings] config document for ${site} is not a config document`);

    return serveLastKnownGood(key, site);
  }

  // A shape change is a deploy error, not an outage: fail loudly and do NOT fall back.
  if (!Number.isInteger(document.version) || document.version !== SUPPORTED_CONFIG_VERSION) {
    consola.error(
      `[site-settings] config document for ${site} reports version ${JSON.stringify(document.version)}; this client reads version ${SUPPORTED_CONFIG_VERSION} only. Refusing to guess, and NOT falling back to last-known-good - a shape change is a deploy error, not an outage.`,
    );

    return null;
  }

  const wrongCased = findWrongCasedKey(document);

  if (wrongCased) {
    consola.error(
      `[site-settings] config document for ${site} carries a non-camel-case key at "${wrongCased}"; the producer must emit camel case and this client must not convert.`,
    );

    return null;
  }

  const leak = findLeakInDocument(document);

  if (leak) {
    consola.error(
      `[site-settings] config document for ${site} tripped the leak check at ${leak}. Refusing to store or return it - treat this as a live exposure in bioland.settings.`,
    );

    return null;
  }

  const settings = sanitizeBiolandSettings(document.config.biolandSettings) as BiolandSettings;

  persistLastKnownGood(key, {
    version: document.version,
    fetchedAt: new Date().toISOString(),
    settings,
  });

  return { settings, stale: false };
}

async function serveLastKnownGood(
  key: LastKnownGoodKey,
  site: string,
): Promise<SiteSettingsResult | null> {
  const record = await readLastKnownGood(key);

  if (!record) {
    consola.error(`[site-settings] no last-known-good settings stored for ${site}; returning null.`);

    return null;
  }

  consola.error(
    `[site-settings] serving last-known-good settings for ${site}, fetched ${record.fetchedAt}.`,
  );

  return { settings: record.settings, stale: true };
}
