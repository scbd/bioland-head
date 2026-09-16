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
 * credentialed URLs, PEM armour, known credential token shapes, and high-entropy tokens - because a
 * key-name pattern misses `panoramaKey` and cannot catch a credential a site admin pasted into a
 * benign field such as `helpComments.*`. A document that trips it is neither stored nor returned,
 * and the same pair runs again on a document READ BACK out of the registry, which is untrusted
 * input for the same reasons.
 *
 * The value scan tokenizes rather than anchoring, so a token embedded in prose is caught; it decodes
 * percent-encoding before testing URIs; and it exempts structured slugs so a hyphenated logo
 * filename does not score as a secret. What it still cannot do: recognise a credential that is
 * short, low-entropy, and of no known shape - a hand-picked password such as `SummerRain2026` is
 * indistinguishable from prose by any of these tests. Layer 1 (the key allowlist) is what bounds
 * that residue, not this.
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
 * Route path, header name and response format are p02-04's to pin. These are the values this client
 * sends, and `tests/e2e/site-settings-contract.test.ts` reads p02-04's own `bioland.routing.yml` and
 * asserts the LITERAL path against it - an earlier version of that check built its URL from this
 * constant, so a wrong constant was wrong in both places and the check still passed.
 *
 * `_format` is not cosmetic: p02-04's route carries `requirements: { _format: 'json' }`
 * (`bioland.routing.yml:103`) and Drupal derives the request format from `?_format=`, defaulting to
 * `html`. A bare GET therefore 404s on a route that exists. It is a routing discriminator, not a
 * secret, so it belongs in the query string where the api key must never go.
 */
export const CONFIG_DOCUMENT_PATH = "/bioland/api/config";
export const CONFIG_DOCUMENT_QUERY = { _format: "json" } as const;
export const CONFIG_API_KEY_HEADER = "x-bioland-api-key";

/**
 * Bound on the serialized size of a document this client will walk, hold, or persist. A config
 * document is a few KB; a megabyte-scale one is either a bug or an attempt to make a Nitro worker
 * allocate. Honest limit: the response body is already in memory by the time `$fetch` resolves, so
 * this bounds what is WALKED, RETURNED and WRITTEN, not what was read off the socket. A true
 * wire-level cap needs a streaming reader, which `$fetch` does not expose.
 */
export const MAX_DOCUMENT_BYTES = 1_048_576;

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
  warnedAboutMissingPort = false;
}

const resolveLastKnownGoodPort = (): Partial<LastKnownGoodPort> | null => registeredPort;

/**
 * Whether a usable last-known-good store is registered - both halves of the port, not just one.
 * p03-01's wiring gate asserts this after p03-02 registers p02-01's module, so "last-known-good is
 * live in production" is something a test can state rather than something the reader must assume.
 */
export function hasLastKnownGoodPort(): boolean {
  return Boolean(
    registeredPort?.writeLastKnownGoodSettings && registeredPort?.readLastKnownGoodSettings,
  );
}

let warnedAboutMissingPort = false;

/**
 * Module-scope and once per process, deliberately. Without it, a merge in which nobody calls
 * {@link registerLastKnownGoodPort} leaves last-known-good SILENTLY dead: every fetch succeeds,
 * every test passes, and the first Drupal outage dark-sites every site with no prior signal. Per
 * request would be log spam on the hot path, so the warning fires on the first successful fetch
 * only and resets when a port is registered.
 */
function warnOnceIfUnwired(): void {
  if (warnedAboutMissingPort || hasLastKnownGoodPort()) return;

  warnedAboutMissingPort = true;

  consola.warn(
    "[site-settings] no last-known-good port registered: running FETCH-ONLY. Nothing is persisted and a Drupal outage will return null rather than a stale document. p03-02 owns calling registerLastKnownGoodPort() once p02-01 is merged.",
  );
}

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

/** Service URIs whose scheme always carries credentials in the authority segment. */
const SECRET_URI = /\b(?:mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqps?|smtps?|ftps?|ldaps?):\/\//i;

/**
 * An http(s) URL with userinfo - `https://svcacct:pw@drupal.internal/api`. `[^/\s@]*` cannot cross a
 * path separator, so `https://host:8080/a` and `https://cdn/a@b` do not match; only credentials in
 * the authority do.
 */
const CREDENTIALED_URL = /\b(?:https?|ftp):\/\/[^/\s@]*:[^/\s@]*@/i;

/** Any PEM armour - private keys, certificates, encrypted blobs. Case-insensitive on purpose. */
const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]+-----/i;

/** Token-shaped: no whitespace, no path separators, no scheme punctuation. Applied per TOKEN. */
const TOKEN_CHARSET = /^[A-Za-z0-9+/=_\-.~]+$/;

/**
 * Splits a string into whitespace/quote-delimited words, then splits each word on URL and path
 * structure. Both passes matter: the first finds a token embedded in prose (the shape that escaped
 * the old anchored `^…$` test), the second stops a logo path scoring as one long high-entropy blob.
 */
const WORD_SPLIT = /[\s"'`,;<>(){}[\]]+/;
const STRUCTURE_SPLIT = /[/?&=#:@\\|]+/;

/** Credential shapes entropy cannot reach - a real AWS key id scores only ~3.7 bits/char. */
const KNOWN_SECRET_TOKENS: Array<[RegExp, string]> = [
  [/^(?:AKIA|ASIA|AIDA|AGPA|AROA|ANPA|ANVA|ABIA|ACCA)[A-Z0-9]{16}$/, "an AWS access key id"],
  [/^gh[pousr]_[A-Za-z0-9]{20,}$/, "a GitHub token"],
  [/^xox[abprs]-[A-Za-z0-9-]{10,}$/i, "a Slack token"],
  [/^AIza[A-Za-z0-9_-]{30,}$/, "a Google API key"],
  [/^eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./, "a JWT"],
  [/^[a-f0-9]{32,}$/i, "a long hex digest or token"],
];

/**
 * 20 chars, down from 25: a real AWS key id is exactly 20 and escaped the old bound. Below 20 the
 * false-positive rate on ordinary identifiers stops being worth it.
 */
const HIGH_ENTROPY_MIN_LENGTH = 20;

/**
 * 3.9 bits/char, measured rather than assumed. Random tokens of this length land above it (a 32-char
 * lowercase-only token scores 4.63, base64 4.54); prose words and camelCase identifiers land below
 * (`componentMenuShowAttributes` 3.86, `Internationalization` 3.11).
 *
 * Entropy alone is NOT sufficient and is not relied on alone. It under-scores short structured
 * credentials (AWS key id 3.68, 40-char hex 3.74), which is why {@link KNOWN_SECRET_TOKENS} exists,
 * and it over-scores hyphenated filenames (`bioland-logo-colour-transparent-2023.png` scores 4.08,
 * over the threshold), which is why {@link isStructuredSlug} exempts them - the exact false positive
 * p02-03 hit by scoring whole paths.
 */
const HIGH_ENTROPY_BITS = 3.9;

/**
 * A slug, filename, or path segment: two or more `-`/`_`/`.` separated parts, each wholly alphabetic
 * or wholly numeric. Random tokens do not decompose this way; `bioland-logo-colour-2023.png` does.
 */
function isStructuredSlug(token: string): boolean {
  const parts = token.split(/[-_.]/).filter(Boolean);

  return parts.length > 1 && parts.every((part) => /^[A-Za-z]+$/.test(part) || /^[0-9]+$/.test(part));
}

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

/**
 * No digit requirement: a 32-char lowercase-only token was one of the shapes that escaped the old
 * detector. A letter is still required, so long numeric ids (phone numbers, timestamps) are exempt.
 */
function isHighEntropySecret(token: string): boolean {
  if (token.length < HIGH_ENTROPY_MIN_LENGTH) return false;
  if (!TOKEN_CHARSET.test(token)) return false;
  if (!/[A-Za-z]/.test(token)) return false;
  if (isStructuredSlug(token)) return false;

  return shannonEntropy(token) >= HIGH_ENTROPY_BITS;
}

/** Whitespace/quote words, each split again on URL and path structure, trimmed of stray punctuation. */
function tokenize(value: string): string[] {
  const tokens: string[] = [];

  for (const word of value.split(WORD_SPLIT))
    for (const part of word.split(STRUCTURE_SPLIT)) {
      const token = part.replace(/^[.,;:!?]+/, "").replace(/[.,;:!?]+$/, "");

      if (token) tokens.push(token);
    }

  return tokens;
}

/**
 * Percent-decoded view of a string, so `mysql%3A%2F%2Fu:p@h/db` is tested as the URI it is. Returns
 * null when the value is not encoded or is malformed, so the caller scans the raw form only once.
 */
function percentDecoded(value: string): string | null {
  if (!value.includes("%")) return null;

  try {
    const decoded = decodeURIComponent(value);

    return decoded === value ? null : decoded;
  } catch {
    return null;
  }
}

/**
 * Value-shaped detection over one string: credential-bearing URIs, PEM armour, known credential
 * token shapes, and high-entropy tokens - the last three matched as SUBSTRINGS via {@link tokenize}
 * rather than against the whole string, because an anchored test misses a token embedded in prose.
 *
 * Returns the reason, never the offending value.
 */
function findSecretInString(value: string): string | null {
  for (const form of [value, percentDecoded(value)]) {
    if (form === null) continue;

    if (SECRET_URI.test(form)) return "value looks like a credential-bearing service URI";
    if (CREDENTIALED_URL.test(form)) return "value is a URL with embedded credentials";
    if (PEM_BLOCK.test(form)) return "value contains a PEM block";

    for (const token of tokenize(form)) {
      for (const [pattern, description] of KNOWN_SECRET_TOKENS)
        if (pattern.test(token)) return `value contains ${description}`;

      if (isHighEntropySecret(token)) return "value contains a high-entropy secret";
    }
  }

  return null;
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
    const reason = findSecretInString(value);

    return reason ? `${path || "<root>"}: ${reason}` : null;
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

/**
 * `config.biolandSettings` must be a NON-EMPTY object, not merely present. A partially-installed or
 * misconfigured module answering 200 with `{ version: 1, config: {} }` used to pass this check,
 * sanitize to `{}`, and overwrite a good last-known-good row with an empty one - destroying the
 * fallback at exactly the moment it is needed. An empty bag is now treated as an outage, so the
 * stored document is served instead and nothing is written.
 */
function isConfigDocument(value: unknown): value is DrupalConfigDocument {
  return (
    isPlainObject(value) &&
    isPlainObject(value.config) &&
    isPlainObject(value.config.biolandSettings) &&
    Object.keys(value.config.biolandSettings).length > 0
  );
}

/**
 * Serialized size of a value, or `null` when it cannot be serialized at all (a circular graph, a
 * throwing getter, a BigInt). Unserializable is not a size this client can bound, so it is refused.
 */
function serializedSize(value: unknown): number | null {
  try {
    return JSON.stringify(value)?.length ?? null;
  } catch {
    return null;
  }
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

    const size = serializedSize(stored);

    if (size === null || size > MAX_DOCUMENT_BYTES) {
      consola.error(
        `[site-settings] stored last-known-good for ${key.siteCode} (${key.env}/${key.multiSiteCode}) is unserializable or exceeds ${MAX_DOCUMENT_BYTES} bytes; ignoring it.`,
      );

      return null;
    }

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

    // Re-filter on READ, not just on write. The registry row is untrusted input: it may have been
    // written by an older build of this module, by p02-02's bulk seeder, or by anything else with
    // registry write access. Serving `record.settings` straight through would ship whatever is in
    // that column to the browser - including a JSON `"__proto__"` own-key that a downstream spread
    // or merge turns into prototype pollution. `sanitizeBiolandSettings` strips that at any depth
    // and re-applies the BL-890 allowlist; the leak check runs on the RESULT, so a credential inside
    // a kept branch is caught rather than assumed absent.
    const settings = sanitizeBiolandSettings(stored.settings) as BiolandSettings;
    const leak = findLeakInDocument(settings);

    if (leak) {
      consola.error(
        `[site-settings] stored last-known-good for ${key.siteCode} (${key.env}/${key.multiSiteCode}) tripped the leak check at ${leak}; refusing to serve it. Treat this as a live exposure in the registry row.`,
      );

      return null;
    }

    return { ...stored, settings };
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

  // Both are optional on the context type, so an absent host would build an "undefined/bioland/..."
  // request that resolves nowhere. That is an outage for this site, not a reason to throw.
  if (!host) {
    consola.error(`[site-settings] no host on the request context for ${site}; cannot fetch config.`);

    return serveLastKnownGood(key, site);
  }

  let document: unknown;

  try {
    const response = await $fetch.raw(
      `${host}${CONFIG_DOCUMENT_PATH}`,
      $fetchBaseOptions({
        headers: { [CONFIG_API_KEY_HEADER]: apiKey },
        query: { ...CONFIG_DOCUMENT_QUERY },
        timeout: CONFIG_FETCH_TIMEOUT_MS,
        // NEVER follow a redirect: `$fetchBaseOptions` defaults to `redirect: 'follow'`, and undici
        // strips `authorization` on a cross-origin hop but forwards `x-bioland-api-key` verbatim
        // (verified empirically). A Drupal open redirect, a hijacked vhost, or a misconfigured 302
        // would hand the service-account key to an arbitrary origin - exactly the leak class the
        // header-not-query-param convention exists to avoid.
        redirect: "manual",
        // Last-known-good IS the retry. `$fetchBaseOptions` retries 3x on 5xx; with a 5s per-attempt
        // timeout that is tens of seconds of a pinned Nitro worker on every uncached render before
        // this degrades. Config must degrade fast, and it degrades to a document it already has.
        retry: 0,
      }),
    );

    if (response.status >= 300 && response.status < 400) {
      consola.error(
        `[site-settings] config endpoint answered ${response.status} for ${site}; refusing to follow a redirect with the api key attached.`,
      );

      return serveLastKnownGood(key, site);
    }

    document = response._data;
  } catch (error: unknown) {
    consola.error(`[site-settings] config fetch failed for ${site}: ${errorReason(error)}`);

    return serveLastKnownGood(key, site);
  }

  return validateAndStore(key, site, document);
}

/**
 * Everything after the wire. Split out and wrapped so the "never throws" contract in the module
 * JSDoc is true of the WHOLE function: the checks walk an attacker-influenced object graph, and a
 * throwing getter or a circular reference in it is a malformed document, not a reason to take down
 * the render. It degrades the same way a 500 does.
 */
function validateAndStore(
  key: LastKnownGoodKey,
  site: string,
  document: unknown,
): Promise<SiteSettingsResult | null> | SiteSettingsResult | null {
  const size = serializedSize(document);

  if (size === null || size > MAX_DOCUMENT_BYTES) {
    consola.error(
      `[site-settings] config document for ${site} is unserializable or exceeds ${MAX_DOCUMENT_BYTES} bytes; refusing to walk or store it.`,
    );

    return serveLastKnownGood(key, site);
  }

  if (!isConfigDocument(document)) {
    consola.error(
      `[site-settings] config document for ${site} is not a config document, or carries an empty config.biolandSettings. Refusing to overwrite last-known-good with it.`,
    );

    return serveLastKnownGood(key, site);
  }

  // Tenant identity, checked BEFORE anything is sanitized, returned, or stored. Every other check
  // in this function asks "is this a well-formed config document"; none of them asks "is it THIS
  // site's". A CDN edge keyed without the Host header, a reverse proxy pointed at the wrong
  // upstream, or a Drupal vhost misbinding all answer 200 with a perfectly VALID document for a
  // different tenant, and shape alone accepts it. The consequence is worse than serving nothing:
  // the other site's theme, analytics ids, and menu configuration are returned for this request
  // AND written into this site's last-known-good row, where they outlive the misroute and keep
  // being served long after the infrastructure is fixed. A document that does not name this site
  // is not this site's config, so it degrades like any other bad document.
  if (typeof document.siteCode !== "string" || document.siteCode !== key.siteCode) {
    consola.error(
      `[site-settings] config document for ${site} is addressed to ${JSON.stringify(document.siteCode)}, not ${key.siteCode}; refusing to serve or store another tenant's config. Treat this as a misrouted request - a CDN, proxy, or vhost is answering for the wrong site.`,
    );

    return serveLastKnownGood(key, site);
  }

  // A shape change is a deploy error, not an outage: fail loudly and do NOT fall back.
  if (!Number.isInteger(document.version) || document.version !== SUPPORTED_CONFIG_VERSION) {
    consola.error(
      `[site-settings] config document for ${site} reports version ${JSON.stringify(document.version)}; this client reads version ${SUPPORTED_CONFIG_VERSION} only. Refusing to guess, and NOT falling back to last-known-good - a shape change is a deploy error, not an outage.`,
    );

    return null;
  }

  let settings: BiolandSettings;

  try {
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

    settings = sanitizeBiolandSettings(document.config.biolandSettings) as BiolandSettings;
  } catch (error: unknown) {
    consola.error(
      `[site-settings] config document for ${site} could not be checked: ${errorReason(error)}. Treating it as malformed.`,
    );

    return serveLastKnownGood(key, site);
  }

  warnOnceIfUnwired();

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
