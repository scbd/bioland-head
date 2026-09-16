/**
 * Build the ISO-2 country code -> `countries` domain identifier map.
 *
 * Discovery (live, re-run to regenerate `../../server/assets/thesaurus-aliases/iso2-countries.json`):
 *
 * 1. `i18n/locales/en.json` has a 680-key block at ordered-key indices [380, 1059] (the same block
 *    boundary `p02-05`'s classifier extends). Within it, 199 keys match `^[a-z]{2}$`. One of those,
 *    the literal key `"or"` (value `"or"`, line 954), is NOT a country — it is the English conjunction
 *    picked up from an embedded JIRA-roadmap-widget sentence ("... return from ... or back to ...").
 *    It is excluded by exact key match, never by a generic "self-referential value" heuristic, so a
 *    future genuinely self-referential country code would not be swallowed by accident. That leaves
 *    198 genuine ISO-2 country-code keys.
 * 2. The CBD API's `countries` domain (see {@link DEFAULT_COUNTRIES_URL}, which a unit test pins to
 *    `getApiUrl('countries')` in `server/utils/thesaurus/config.ts` so the two cannot drift) was
 *    probed live against `GET {base}/countries/terms`. It returns a flat JSON array of 198 items. Each item's
 *    `identifier` field is EMPIRICALLY CONFIRMED to already be the lowercase ISO-2 code verbatim
 *    (e.g. `{ identifier: "ad", name: "Andorra", ... }`) — not a GUID, not a differently-cased
 *    variant. This was confirmed by inspection of the raw response, not assumed from `config.ts`'s
 *    `flagcdn.com` transform (which only lowercases the identifier for a URL and does not by itself
 *    prove the identifier equals the ISO-2 code).
 * 3. Matching the 198 genuine locale keys against the 198 API identifiers (case-insensitive) produced
 *    a complete 1:1 bijection: every genuine key has a matching API identifier, and every API
 *    identifier has a matching genuine key. Zero entries required `_unmapped`.
 *
 * Final counts: 198 genuine codes mapped, 0 unmapped, 1 documented exclusion (`"or"`).
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const LOCALE_FILE = path.join(REPO_ROOT, 'i18n/locales/en.json');
const OUTPUT_FILE = path.join(REPO_ROOT, 'server/assets/thesaurus-aliases/iso2-countries.json');

/**
 * The `countries` domain URL.
 *
 * Deliberately NOT imported from `server/utils/thesaurus/config.ts`: this is a plain `.mjs`
 * generator and `package.json` supports Node >= 20, which cannot execute TypeScript natively, so a
 * direct `.ts` import fails with ERR_UNKNOWN_FILE_EXTENSION on a supported local runtime. Vitest
 * and the Node 24 Docker image both transform the import and would have masked that.
 *
 * The single-source guarantee is kept by assertion instead of by import:
 * `tests/unit/server/utils/thesaurus/aliases/iso2-countries.test.ts` runs under Vitest (which does
 * resolve the `.ts`) and fails if this default ever drifts from `getApiUrl('countries')`.
 * `THESAURUS_COUNTRIES_URL` overrides it for a non-default environment.
 */
export const DEFAULT_COUNTRIES_URL = 'https://api.cbd.int/api/v2013/thesaurus/domains/countries/terms';
const getCountriesUrl = () => process.env.THESAURUS_COUNTRIES_URL || DEFAULT_COUNTRIES_URL;

/** Guard against a runaway or hostile response body. */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/**
 * Read a response body while enforcing {@link MAX_RESPONSE_BYTES} in ACTUAL BYTES as chunks
 * arrive, rather than buffering the whole payload first and then measuring `String.length`
 * (UTF-16 code units, not bytes). The stream is cancelled the moment the cap is exceeded.
 */
async function readBodyWithByteCap(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`countries domain response declared ${declared} bytes (> ${maxBytes}); refusing to read`);
  }
  if (!response.body) return await response.text();

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`countries domain response exceeded ${maxBytes} bytes; refusing to parse`);
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

/** The exact, auditable false-positive exclusion: this key, not a generic heuristic. */
const FALSE_POSITIVE_KEYS = new Set(['or']);

/**
 * Shape every identifier written to the committed map must satisfy: a lowercase ISO-2 code,
 * matching the key shape it maps from. Guards against a changed or hostile API response landing
 * arbitrary text in a file that later feeds API path segments and cache keys.
 */
const VALID_IDENTIFIER = /^[a-z]{2}$/;

/** Block boundary shared with `p02-05`'s classifier: ordered-key indices [380, 1059] inclusive. */
const BLOCK_START = 380;
const BLOCK_END = 1059;

/**
 * Enumerate the genuine `iso2`-bucket keys directly from the live locale file, excluding the known
 * false positive by exact key name.
 */
export function getGenuineIso2Keys(localeData) {
  const keys = Object.keys(localeData);
  const block = keys.slice(BLOCK_START, BLOCK_END + 1);
  const iso2Bucket = block.filter((key) => /^[a-z]{2}$/.test(key));
  const genuine = iso2Bucket.filter((key) => !FALSE_POSITIVE_KEYS.has(key));
  return { iso2Bucket, genuine };
}

/**
 * Build the { "<iso2>": "<countries-domain-identifier>" } map (plus `_unmapped` for any genuine code
 * with no live counterpart, or whose matched identifier fails the {@link VALID_IDENTIFIER} shape
 * check), from the genuine key list and the live `countries` domain enumeration.
 *
 * The lookup key is lowercased for a case-insensitive match, but the value actually written is the
 * matched identifier only when it already satisfies the ISO-2 shape verbatim — never coerced,
 * so a malformed or mixed-case identifier is routed to `_unmapped` rather than written silently.
 */
export function buildMap(genuineKeys, countryTerms) {
  const byIdentifier = new Map(countryTerms.map((item) => [String(item.identifier).toLowerCase(), item]));
  const map = {};
  const unmapped = [];

  for (const code of [...genuineKeys].sort()) {
    const match = byIdentifier.get(code);
    if (match && VALID_IDENTIFIER.test(match.identifier)) {
      map[code] = match.identifier;
    } else {
      unmapped.push(code);
    }
  }

  return unmapped.length > 0 ? { ...map, _unmapped: unmapped } : map;
}

// Straight-line live-HTTP-fetch entrypoint; excluded from the coverage denominator per the
// task's own testing note (only the matching/exclusion logic below is measured).
/* v8 ignore next */
async function main() {
  const localeData = JSON.parse(readFileSync(LOCALE_FILE, 'utf8'));
  const { iso2Bucket, genuine } = getGenuineIso2Keys(localeData);

  if (!FALSE_POSITIVE_KEYS.has('or') || !iso2Bucket.includes('or')) {
    throw new Error(
      `Expected the "or" false positive to be present in the live iso2 bucket for an auditable exclusion; ` +
        `found bucket of ${iso2Bucket.length} keys without it. Re-verify i18n/locales/en.json:954.`
    );
  }

  const url = getCountriesUrl();
  console.log(`Fetching live countries domain from ${url} ...`);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`countries domain fetch failed: ${response.status} ${response.statusText}`);
  }
  const countryTerms = JSON.parse(await readBodyWithByteCap(response, MAX_RESPONSE_BYTES));

  const result = buildMap(genuine, countryTerms);
  const unmappedCount = Array.isArray(result._unmapped) ? result._unmapped.length : 0;
  const mappedCount = Object.keys(result).filter((k) => k !== '_unmapped').length;

  console.log(`iso2 bucket keys in block: ${iso2Bucket.length}`);
  console.log(`false positive excluded: "or"`);
  console.log(`genuine codes: ${genuine.length}`);
  console.log(`mapped: ${mappedCount}`);
  console.log(`unmapped: ${unmappedCount}${unmappedCount ? ` (${result._unmapped.join(', ')})` : ''}`);

  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2) + '\n');
  console.log(`Wrote ${OUTPUT_FILE}`);
}

/* v8 ignore next */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
