import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `server/utils/drupal/site-settings.ts` relies on Nuxt auto-imports (`useRuntimeConfig`,
 * `$fetch`, `$fetchBaseOptions`), which are stubbed on `globalThis` here the same way
 * `drupal-auth.test.js` does it. `consola` is imported by the module rather than auto-imported, so
 * it is mocked at module level instead.
 */
vi.mock("consola", () => {
  const consola = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

  return { consola, default: consola };
});

import { consola } from "consola";

import {
  fetchSiteSettings,
  findLeakInDocument,
  findWrongCasedKey,
  awaitPendingWriteBacks,
  registerLastKnownGoodPort,
  hasLastKnownGoodPort,
  CONFIG_API_KEY_HEADER,
  CONFIG_DOCUMENT_PATH,
  CONFIG_DOCUMENT_QUERY,
  CONFIG_FETCH_TIMEOUT_MS,
  MAX_DOCUMENT_BYTES,
  SUPPORTED_CONFIG_VERSION,
  type DrupalConfigDocument,
  type LastKnownGoodRecord,
} from "../../../../../server/utils/drupal/site-settings";
import { BIOLAND_SETTINGS_ALLOWLIST } from "../../../../../server/utils/bioland-settings";

const API_KEY = "dummy-api-key-not-a-real-credential";

const ctx = { siteCode: "example", env: "dev", multiSiteCode: "bl2", host: "https://example.test" };

/**
 * p01-01's machine-checkable example document is the assertion target. It lands with p01-01, which
 * is not a branch parent of this task, so the conformance test drives it when present and falls
 * back to the envelope the contract spec publishes (§ "The Drupal config document") when not -
 * never to a hand-written substitute that would make this task assert against itself.
 */
const EXAMPLE_DOCUMENT_PATH = resolveExampleDocument();

const hasExampleDocument = EXAMPLE_DOCUMENT_PATH !== null;

/**
 * p01-01's example document, in precedence order:
 *
 * 1. `tests/fixtures/config-contract/…` in this checkout — where it lands once p01-01 merges.
 * 2. the same path in the sibling `p01-01` worktree — where it lives while p01-01 is unmerged.
 *    Read-only; nothing here writes to that worktree.
 * 3. `$BL985_CONTRACT_EXAMPLE_DOCUMENT`, for a checkout that keeps its worktrees elsewhere.
 *
 * Never a fixture authored by this task: asserting against one's own output is not a conformance
 * check. When none of the three resolve, the suite falls back to the envelope the contract SPEC
 * publishes and says so in the test name.
 */
function resolveExampleDocument(): string | null {
  const relative = "tests/fixtures/config-contract/drupal-config-document.example.json";
  const root = resolve(__dirname, "../../../../..");

  const candidates = [
    resolve(root, relative),
    resolve(root, "../p01-01", relative),
    process.env.BL985_CONTRACT_EXAMPLE_DOCUMENT,
  ];

  return candidates.find((path) => path && existsSync(path)) ?? null;
}

/** The contract's published envelope, used only when p01-01's example document is not on branch. */
const CONTRACT_ENVELOPE: DrupalConfigDocument = {
  version: SUPPORTED_CONFIG_VERSION,
  generated: "2026-01-01T00:00:00.000Z",
  siteCode: "example",
  config: {
    biolandSettings: { theme: { color: { primary: "#101010" } }, googleAnalyticsIds: "G-EXAMPLE0" },
    systemSite: { name: "Example Site", translations: { "pt-br": { name: "Site Exemplo" } } },
    systemDate: { timezone: { default: "UTC" } },
  },
};

const contractDocument = (): DrupalConfigDocument => ({
  ...(EXAMPLE_DOCUMENT_PATH
    ? (JSON.parse(readFileSync(EXAMPLE_DOCUMENT_PATH, "utf8")) as DrupalConfigDocument)
    : structuredClone(CONTRACT_ENVELOPE)),
  // p01-01's example document names p01-01's own site. These tests fetch config for `ctx.siteCode`,
  // and the client now refuses a document addressed to a different tenant - correctly, that is the
  // cross-tenant check below. A config document is per-site, so addressing the contract envelope to
  // the site under test is setup, not a weakened assertion: the envelope's shape is untouched, and
  // the conformance block still checks `siteCode` is a string.
  siteCode: ctx.siteCode,
});

let fetchCalls: Array<{ uri: string; options: Record<string, unknown> }> = [];
let fetchImpl: () => Promise<unknown> = async () => contractDocument();
/** Status the `$fetch.raw` double reports. 3xx is the interesting one: the client must not follow. */
let fetchStatus = 200;

let store: Record<string, unknown> | null = null;
let writes: Array<{ key: unknown; record: LastKnownGoodRecord }> = [];
let writeShouldFail = false;
const readSpy = vi.fn();

/**
 * Mirrors p02-01's real exports (`server/utils/site-registry/index.ts`, commit c1e18f7): POSITIONAL
 * `(env, multiSiteCode, siteCode, …)`, and a read returning the raw stored object. Keeping the
 * double here shaped like the real thing is what makes "it lights up when p02-01 merges" a claim a
 * test backs rather than a hope - a positional/object mismatch would pass an object-shaped double
 * and fail against the real module.
 */
const withRegistry = () =>
  registerLastKnownGoodPort({
    writeLastKnownGoodSettings: async (env, multiSiteCode, siteCode, doc) => {
      if (writeShouldFail) throw new Error("registry unavailable");

      writes.push({ key: { env, multiSiteCode, siteCode }, record: doc as LastKnownGoodRecord });
      store = doc as Record<string, unknown>;
    },
    readLastKnownGoodSettings: async (env, multiSiteCode, siteCode) => {
      readSpy({ env, multiSiteCode, siteCode });

      return store;
    },
  });

beforeEach(() => {
  fetchCalls = [];
  writes = [];
  store = null;
  writeShouldFail = false;
  fetchStatus = 200;
  fetchImpl = async () => contractDocument();
  readSpy.mockClear();
  vi.mocked(consola.error).mockClear();
  vi.mocked(consola.warn).mockClear();

  globalThis.useRuntimeConfig = () => ({ apiKey: API_KEY, public: {} });
  // Mirrors the real default, `redirect: 'follow'` included, so a client that forgets to override
  // it fails the redirect test rather than silently inheriting a safe value from the double.
  globalThis.$fetchBaseOptions = (options = {}) => ({
    method: "GET",
    redirect: "follow",
    retry: 3,
    retryStatusCodes: [408, 429, 500, 502, 503, 504],
    ...options,
  });

  const raw = async (uri: string, options: Record<string, unknown>) => {
    fetchCalls.push({ uri, options });

    return { status: fetchStatus, _data: await fetchImpl() };
  };

  // Only `.raw` is provided: the client reads the response STATUS, so a regression back to the
  // plain `$fetch` (which cannot see a 3xx) fails here rather than silently following redirects.
  globalThis.$fetch = Object.assign(
    () => {
      throw new Error("the config client must use $fetch.raw so it can inspect the status");
    },
    { raw },
  );

  withRegistry();
});

afterEach(async () => {
  await awaitPendingWriteBacks();

  registerLastKnownGoodPort(null);

  delete globalThis.useRuntimeConfig;
  delete globalThis.$fetch;
  delete globalThis.$fetchBaseOptions;
});

describe("fetchSiteSettings - transport", () => {
  it("sends the api key as a request header and never in the query string", async () => {
    await fetchSiteSettings(ctx);

    const [call] = fetchCalls;

    expect(call!.uri).toBe(`https://example.test${CONFIG_DOCUMENT_PATH}`);
    expect(call!.uri).not.toContain("api-key");
    expect(call!.uri).not.toContain(API_KEY);
    expect(call!.options.headers).toEqual({ [CONFIG_API_KEY_HEADER]: API_KEY });
    expect(JSON.stringify(call!.options.query)).not.toContain(API_KEY);
  });

  it("targets p02-04's route path", () => {
    // The literal, not a re-derivation: p02-04 serves `/bioland/api/config`
    // (`bioland.routing.yml:96`), and the e2e conformance check asserts this same literal against
    // that file. A previous version of the constant said `/bioland/config` and nothing caught it.
    expect(CONFIG_DOCUMENT_PATH).toBe("/bioland/api/config");
  });

  it("sends _format=json so Drupal's format requirement matches", async () => {
    // p02-04's route requires `_format: 'json'`. Drupal derives the format from `?_format=` and
    // defaults to `html`, so without this a correct path still 404s.
    await fetchSiteSettings(ctx);

    expect(fetchCalls[0]!.options.query).toMatchObject({ _format: "json" });
    expect(CONFIG_DOCUMENT_QUERY).toEqual({ _format: "json" });
  });

  it("never follows a redirect, so the api key cannot cross origins", async () => {
    await fetchSiteSettings(ctx);

    // undici strips `authorization` on a cross-origin hop but forwards `x-bioland-api-key`
    // verbatim, so `redirect: 'follow'` would hand the key to whatever a 302 points at.
    expect(fetchCalls[0]!.options.redirect).toBe("manual");
  });

  it("treats a 3xx as a fetch failure rather than following it with the key attached", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    fetchCalls = [];
    vi.mocked(consola.error).mockClear();
    fetchStatus = 302;

    const result = await fetchSiteSettings(ctx);

    expect(result?.stale).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("refusing to follow a redirect");
  });

  it("does not retry: last-known-good is the retry", async () => {
    // `$fetchBaseOptions` defaults to 3 retries on 5xx; with a 5s per-attempt timeout that pins a
    // Nitro worker for tens of seconds on every uncached render before degrading.
    await fetchSiteSettings(ctx);

    expect(fetchCalls[0]!.options.retry).toBe(0);
  });

  it("serves last-known-good rather than fetching 'undefined/...' when the context has no host", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    fetchCalls = [];
    vi.mocked(consola.error).mockClear();

    const result = await fetchSiteSettings({ siteCode: "example", env: "dev", multiSiteCode: "bl2" });

    expect(fetchCalls).toHaveLength(0);
    expect(result?.stale).toBe(true);
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("no host on the request context");
  });

  it("enforces a request timeout so a hanging Drupal cannot hold a worker open", async () => {
    await fetchSiteSettings(ctx);

    expect(fetchCalls[0]!.options.timeout).toBe(CONFIG_FETCH_TIMEOUT_MS);
    expect(CONFIG_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("never logs the api key", async () => {
    fetchImpl = async () => {
      throw new Error("boom");
    };

    await fetchSiteSettings(ctx);

    for (const call of vi.mocked(consola.error).mock.calls)
      expect(JSON.stringify(call)).not.toContain(API_KEY);
  });
});

describe("fetchSiteSettings - fresh success", () => {
  it("returns the sanitized settings marked fresh", async () => {
    const result = await fetchSiteSettings(ctx);

    expect(result?.stale).toBe(false);
    expect(result?.settings).toBeTruthy();
    expect(result?.settings.theme).toBeTruthy();
  });

  it("never ships siteName - getSiteSettings owns it", async () => {
    const result = await fetchSiteSettings(ctx);

    expect(result?.settings).not.toHaveProperty("siteName");
    expect(result?.settings).not.toHaveProperty("systemSite");
    expect(JSON.stringify(result)).not.toContain("Example Site");
  });

  it("writes the fresh document back as last-known-good, stamped with version and fetch time", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    expect(writes).toHaveLength(1);
    expect(writes[0]!.key).toEqual({ env: "dev", multiSiteCode: "bl2", siteCode: "example" });
    expect(writes[0]!.record.version).toBe(SUPPORTED_CONFIG_VERSION);
    expect(Date.parse(writes[0]!.record.fetchedAt)).not.toBeNaN();
  });

  it("still returns the fresh document when the write-back fails", async () => {
    writeShouldFail = true;

    const result = await fetchSiteSettings(ctx);

    await awaitPendingWriteBacks();

    expect(result?.stale).toBe(false);
    expect(result?.settings.theme).toBeTruthy();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("last-known-good write failed");
  });

  it("degrades to fetch-only when no port is registered at all", async () => {
    // The state of this branch: p02-01 is unmerged, so nothing has registered a store. The client
    // must degrade to fetch-only, not throw and not stall.
    registerLastKnownGoodPort(null);

    const result = await fetchSiteSettings(ctx);

    await awaitPendingWriteBacks();

    expect(result?.stale).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("degrades to fetch-only when p02-01's write path is absent", async () => {
    registerLastKnownGoodPort({});

    const result = await fetchSiteSettings(ctx);

    await awaitPendingWriteBacks();

    expect(result?.stale).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe("fetchSiteSettings - failure modes serve last-known-good", () => {
  const seed = async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    fetchCalls = [];
    vi.mocked(consola.error).mockClear();
  };

  const failures: Array<[string, () => Promise<never>]> = [
    [
      "timeout",
      async () => {
        throw Object.assign(new Error("The operation was aborted due to timeout"), {
          name: "TimeoutError",
        });
      },
    ],
    [
      "non-2xx",
      async () => {
        throw Object.assign(new Error("503 Service Unavailable"), {
          name: "FetchError",
          statusCode: 503,
        });
      },
    ],
    [
      "network",
      async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), { name: "FetchError" });
      },
    ],
  ];

  for (const [label, impl] of failures)
    it(`serves last-known-good on ${label}, marked stale`, async () => {
      await seed();

      fetchImpl = impl;

      const result = await fetchSiteSettings(ctx);

      expect(result?.stale).toBe(true);
      expect(result?.settings.theme).toBeTruthy();
      expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("example (dev/bl2)");
    });

  it("returns null when nothing is stored", async () => {
    fetchImpl = async () => {
      throw new Error("down");
    };

    expect(await fetchSiteSettings(ctx)).toBeNull();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("no last-known-good");
  });

  it("returns null when the registry read path is absent", async () => {
    registerLastKnownGoodPort({});

    fetchImpl = async () => {
      throw new Error("down");
    };

    expect(await fetchSiteSettings(ctx)).toBeNull();
  });

  it("returns null rather than throwing when the registry read itself fails", async () => {
    // p02-01 throws for all three of no-row / malformed-row / unreachable rather than returning a
    // sentinel, so the throwing path is the normal one, not an exotic one.
    registerLastKnownGoodPort({
      readLastKnownGoodSettings: async () => {
        throw Object.assign(new Error("registry unreachable"), {
          name: "RegistryUnavailableError",
        });
      },
    });

    fetchImpl = async () => {
      throw new Error("down");
    };

    expect(await fetchSiteSettings(ctx)).toBeNull();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("last-known-good read failed");
  });

  it("ignores a stored record that is not readable rather than serving it as settings", async () => {
    for (const stored of [
      { settings: { theme: {} } },
      { version: 1, fetchedAt: 1758000000000, settings: {} },
      { version: 1, fetchedAt: "2026-01-01T00:00:00.000Z", settings: "not-an-object" },
    ]) {
      registerLastKnownGoodPort({
        readLastKnownGoodSettings: async () => stored as Record<string, unknown>,
      });

      fetchImpl = async () => {
        throw new Error("down");
      };

      expect(await fetchSiteSettings(ctx)).toBeNull();
    }

    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("not a readable record");
  });

  it("refuses a stored record written by a different major version", async () => {
    registerLastKnownGoodPort({
      readLastKnownGoodSettings: async () => ({
        version: SUPPORTED_CONFIG_VERSION + 1,
        fetchedAt: "2026-01-01T00:00:00.000Z",
        settings: { theme: {} },
      }),
    });

    fetchImpl = async () => {
      throw new Error("down");
    };

    expect(await fetchSiteSettings(ctx)).toBeNull();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("this client reads version");
  });

  it("serves last-known-good when the payload is not a config document", async () => {
    await seed();

    fetchImpl = async () => "<html>maintenance</html>";

    expect((await fetchSiteSettings(ctx))?.stale).toBe(true);
  });
});

describe("fetchSiteSettings - a document must name the site that asked for it", () => {
  /** A valid document for a DIFFERENT tenant: correct shape, correct version, wrong `siteCode`. */
  const otherTenantDocument = (): DrupalConfigDocument => ({
    ...contractDocument(),
    siteCode: "other-tenant",
    config: {
      biolandSettings: {
        theme: { color: { primary: "#ff00ff" } },
        googleAnalyticsIds: "G-OTHERTENANT",
      },
    },
  });

  it("refuses another tenant's document rather than serving it as this site's config", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    vi.mocked(consola.error).mockClear();

    // A CDN keyed without the Host header, a proxy on the wrong upstream, or a misbound vhost:
    // 200, valid, and for someone else. Shape alone used to accept it.
    fetchImpl = otherTenantDocument;

    const result = await fetchSiteSettings(ctx);

    expect(result?.stale).toBe(true);
    expect(result?.settings.googleAnalyticsIds).not.toBe("G-OTHERTENANT");
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("is addressed to");
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("other-tenant");
  });

  it("never writes another tenant's settings into this site's last-known-good row", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    const good = structuredClone(store);

    expect(good).toBeTruthy();

    writes = [];
    fetchImpl = otherTenantDocument;

    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    // The damage a shape-only check does is not the one bad response - it is the poisoned row that
    // keeps serving the wrong tenant's config long after the misroute is fixed.
    expect(writes).toEqual([]);
    expect(store).toEqual(good);
  });

  it("refuses a document with no siteCode at all, rather than reading it as a match", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    vi.mocked(consola.error).mockClear();

    const { siteCode: _omitted, ...withoutSiteCode } = contractDocument();

    fetchImpl = async () => withoutSiteCode;

    expect((await fetchSiteSettings(ctx))?.stale).toBe(true);
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("is addressed to");
  });
});

describe("fetchSiteSettings - version check does not fall back", () => {
  const seedThen = async (document: unknown) => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    readSpy.mockClear();
    vi.mocked(consola.error).mockClear();
    fetchImpl = async () => document;

    return fetchSiteSettings(ctx);
  };

  it("fails loudly on an unexpected major version and does not read last-known-good", async () => {
    const result = await seedThen({ ...contractDocument(), version: 2 });

    expect(result).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("NOT falling back");
  });

  it("rejects a missing or non-integer version rather than guessing", async () => {
    for (const version of [undefined, "1", 1.5, null]) {
      const document = { ...contractDocument(), version } as unknown;

      expect(await seedThen(document)).toBeNull();
    }
  });
});

describe("fetchSiteSettings - the second leak layer", () => {
  it("refuses a credential-shaped VALUE under a benign key name", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    const before = writes.length;
    const document = contractDocument();

    (document.config.biolandSettings as Record<string, unknown>).helpComments = {
      note: "AKIAFAKE0000EXAMPLE7h4Qz2Xv9Lm3Np8Rt5Yw1",
    };

    fetchImpl = async () => document;
    vi.mocked(consola.error).mockClear();

    expect(await fetchSiteSettings(ctx)).toBeNull();

    await awaitPendingWriteBacks();

    expect(writes).toHaveLength(before);
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("live exposure");
  });

  it("refuses a service URI and a PEM block", async () => {
    expect(findLeakInDocument({ helpComments: { a: "mysql://u:p@db.internal:3306/x" } })).toContain(
      "service URI",
    );
    expect(
      findLeakInDocument({ helpComments: { a: "-----BEGIN RSA PRIVATE KEY-----\nzzz" } }),
    ).toContain("PEM block");
  });

  it("refuses a never-ship key name at any depth, envelope included", async () => {
    expect(findLeakInDocument({ panoramaKey: "x" })).toContain("never-ship key name");
    expect(findLeakInDocument({ config: { biolandSettings: { meta: {} } } })).toContain(
      "config.biolandSettings.meta",
    );
  });

  /**
   * Every one of these escaped the first implementation of the detector, each verified by running
   * that exact logic. They are regression cases, not hypotheticals: the value scan was anchored
   * (`^…$`), so a token in prose slipped through; it required a digit, so a lowercase-only token
   * did; its URI pattern omitted `https?`; it never percent-decoded; its length floor was 25, over
   * the 20 characters of a real AWS key id; and its PEM pattern was uppercase-only.
   */
  const MUST_CATCH: Array<[string, string]> = [
    ["token embedded in prose", "deploy token AKIAFAKE0000EXAMPLE7h4Qz2Xv9Lm3Np8Rt5Yw1 keep it safe"],
    ["lowercase-only 32-char token", "qwmzrblkxnvdtysghfjpaoceuirwbnmk"],
    ["https URL with userinfo", "https://svcacct:S3cr3tPassw0rd@drupal.internal/api"],
    ["percent-encoded service URI", "mysql%3A%2F%2Fsvcacct%3Apw%40db.internal%3A3306%2Fbioland"],
    ["AWS access key id at 20 chars", "AKIAIOSFODNN7EXAMPLE"],
    ["lowercase PEM armour", "-----begin rsa private key-----\nMIIE"],
    ["long hex digest", "da39a3ee5e6b4b0d3255bfef95601890afd80709"],
  ];

  for (const [label, payload] of MUST_CATCH) {
    it(`catches ${label} under a benign key`, () => {
      expect(findLeakInDocument({ helpComments: { note: payload } })).not.toBeNull();
    });

    it(`catches ${label} inside an array element`, () => {
      expect(findLeakInDocument({ helpComments: { notes: ["fine", payload] } })).not.toBeNull();
    });
  }

  /**
   * The other half of the calibration. p02-03 shipped an entropy check whose tokenizer kept `/`,
   * `-` and `_` inside tokens, so ordinary logo paths and URLs scored 4.0-4.3 against a 4.0
   * threshold and were flagged as secrets. Splitting on path and URL structure, plus exempting
   * slug-shaped tokens, is what keeps these clean - so they are asserted, not assumed.
   */
  const MUST_NOT_FLAG: Array<[string, unknown]> = [
    ["a real logo URL", "https://www.cbd.int/sites/default/files/2023-05/bioland-logo-colour.png"],
    ["a logo path with a year segment", "/sites/default/files/bioland-logo-colour-transparent-2023.png"],
    ["a long camelCase identifier", "componentMenuShowAttributes"],
    ["an IANA timezone", "America/Argentina/Buenos_Aires"],
    ["prose", "Please provide the national focal point contact information for your country here"],
    ["a hyphenated slug", "convention-on-biological-diversity-national-report"],
    ["a numeric id", "1234567890123456789012345"],
  ];

  for (const [label, payload] of MUST_NOT_FLAG)
    it(`does not flag ${label}`, () => {
      expect(findLeakInDocument({ theme: { logo: payload } })).toBeNull();
    });

  it("passes a clean contract document", () => {
    expect(findLeakInDocument(contractDocument())).toBeNull();
  });

  it("walks arrays and tolerates non-object leaves", () => {
    expect(findLeakInDocument({ a: [1, "ok", { b: ["mysql://u:p@h/db"] }] })).toContain(
      "a[2].b[0]",
    );
    expect(findLeakInDocument({ a: [1, true, null, "short"] })).toBeNull();
  });

  it("fails closed past the depth bound", () => {
    let nested: Record<string, unknown> = {};
    const leaf = nested;

    for (let i = 0; i < 40; i += 1) nested = { down: nested };

    leaf.x = 1;

    expect(findLeakInDocument(nested)).toContain("nests deeper than");
  });
});

describe("fetchSiteSettings - an empty document must not poison the fallback", () => {
  it("refuses to overwrite a stored last-known-good with an empty config.biolandSettings", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    const good = structuredClone(store);

    expect(good).toBeTruthy();

    vi.mocked(consola.error).mockClear();

    // A partially-installed or misconfigured module answering 200 with an empty bag. This used to
    // pass the shape check, sanitize to `{}`, and destroy the fallback at the worst moment.
    fetchImpl = async () => ({ version: SUPPORTED_CONFIG_VERSION, generated: "2026-01-01T00:00:00.000Z", siteCode: "example", config: {} });

    const result = await fetchSiteSettings(ctx);

    await awaitPendingWriteBacks();

    expect(store).toEqual(good);
    expect(result?.stale).toBe(true);
    expect(result?.settings.theme).toBeTruthy();
  });

  it("refuses a document whose keys all fall outside the allowlist, leaving nothing after sanitizing", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    const good = structuredClone(store);

    expect(good).toBeTruthy();

    writes = [];
    vi.mocked(consola.error).mockClear();

    // NONEMPTY raw, so the `isConfigDocument` check passes - but every key is outside the BL-890
    // allowlist, so it sanitizes to `{}`. A partially-configured Drupal emitting an editor-only
    // field, or a field newer than this build, looks exactly like this.
    fetchImpl = async () => ({
      version: SUPPORTED_CONFIG_VERSION,
      generated: "2026-01-01T00:00:00.000Z",
      siteCode: ctx.siteCode,
      config: { biolandSettings: { helpComments: "hello" } },
    });

    const result = await fetchSiteSettings(ctx);

    await awaitPendingWriteBacks();

    expect(writes).toEqual([]);
    expect(store).toEqual(good);
    expect(result?.stale).toBe(true);
    expect(result?.settings.theme).toBeTruthy();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("no allowlisted settings");
  });

  it("refuses to overwrite last-known-good with an empty bag even when nothing is stored yet", async () => {
    // The fallback must not be created empty either: a first request during a partial Drupal
    // configuration would otherwise seed the row with `{}` and make every later request serve it.
    fetchImpl = async () => ({
      version: SUPPORTED_CONFIG_VERSION,
      generated: "2026-01-01T00:00:00.000Z",
      siteCode: ctx.siteCode,
      config: { biolandSettings: { helpComments: "hello" } },
    });

    const result = await fetchSiteSettings(ctx);

    await awaitPendingWriteBacks();

    expect(writes).toEqual([]);
    expect(store).toBeNull();
    expect(result).toBeNull();
  });

  it("refuses a document that exceeds the size bound rather than holding and storing it", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    const good = structuredClone(store);

    fetchImpl = async () => ({
      version: SUPPORTED_CONFIG_VERSION,
      generated: "2026-01-01T00:00:00.000Z",
      siteCode: "example",
      config: { biolandSettings: { theme: { note: "x".repeat(MAX_DOCUMENT_BYTES + 1) } } },
    });

    expect((await fetchSiteSettings(ctx))?.stale).toBe(true);

    await awaitPendingWriteBacks();

    expect(store).toEqual(good);
  });

  it("never throws when a check hits a throwing getter", async () => {
    await fetchSiteSettings(ctx);
    await awaitPendingWriteBacks();

    const hostile = { version: SUPPORTED_CONFIG_VERSION, generated: "2026-01-01T00:00:00.000Z", siteCode: "example", config: { biolandSettings: {} } };

    Object.defineProperty(hostile.config.biolandSettings, "theme", {
      enumerable: true,
      get() {
        throw new Error("hostile getter");
      },
    });

    fetchImpl = async () => hostile;

    // Serializing it throws too, so it is refused at the size bound - either way, no throw escapes.
    expect((await fetchSiteSettings(ctx))?.stale).toBe(true);
  });
});

describe("fetchSiteSettings - a stored row is untrusted input", () => {
  /** The registry column is free-form JSON writable by anything with registry access. */
  const servedFrom = async (settings: unknown) => {
    registerLastKnownGoodPort({
      readLastKnownGoodSettings: async () => ({
        version: SUPPORTED_CONFIG_VERSION,
        fetchedAt: "2026-01-01T00:00:00.000Z",
        settings,
      }),
    });

    fetchImpl = async () => {
      throw new Error("down");
    };

    return fetchSiteSettings(ctx);
  };

  it("strips a JSON __proto__ own-key out of a stored row before serving it", async () => {
    const settings = JSON.parse('{"theme":{"color":"#fff"},"__proto__":{"polluted":true},"megaMenu":{"__proto__":{"polluted":true}}}');

    const result = await servedFrom(settings);

    expect(result?.stale).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result!.settings, "__proto__")).toBe(false);
    expect(JSON.stringify(result!.settings)).not.toContain("polluted");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("re-applies the BL-890 allowlist to a stored row written by an older build", async () => {
    const result = await servedFrom({ theme: { color: "#fff" }, panoramaKeyish: "x", systemSite: { name: "Example Site" } });

    expect(result?.settings).not.toHaveProperty("systemSite");
    expect(result?.settings).not.toHaveProperty("panoramaKeyish");
    expect(result?.settings.theme).toBeTruthy();
  });

  it("refuses to serve a stored row carrying a credential", async () => {
    const result = await servedFrom({ theme: { note: "mysql://svcacct:pw@db.internal:3306/bioland" } });

    expect(result).toBeNull();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("live exposure in the registry row");
  });
});

describe("last-known-good wiring", () => {
  it("reports whether a usable port is registered, so p03-01 can gate on it", () => {
    registerLastKnownGoodPort(null);
    expect(hasLastKnownGoodPort()).toBe(false);

    registerLastKnownGoodPort({ readLastKnownGoodSettings: async () => null });
    expect(hasLastKnownGoodPort()).toBe(false);

    withRegistry();
    expect(hasLastKnownGoodPort()).toBe(true);
  });

  it("warns once per process - not per request - when a fetch succeeds with no port registered", async () => {
    registerLastKnownGoodPort(null);

    await fetchSiteSettings(ctx);
    await fetchSiteSettings(ctx);
    await fetchSiteSettings(ctx);

    const warnings = vi
      .mocked(consola.warn)
      .mock.calls.filter((call) => String(call[0]).includes("FETCH-ONLY"));

    expect(warnings).toHaveLength(1);
  });

  it("stays quiet when a port is registered", async () => {
    await fetchSiteSettings(ctx);

    expect(vi.mocked(consola.warn).mock.calls.join(" ")).not.toContain("FETCH-ONLY");
  });
});

describe("fetchSiteSettings - casing", () => {
  it("rejects a snake_case key instead of re-running camelCase", async () => {
    const document = contractDocument();

    (document.config.biolandSettings as Record<string, unknown>).google_analytics_ids = "G-1";

    fetchImpl = async () => document;

    expect(await fetchSiteSettings(ctx)).toBeNull();
    expect(vi.mocked(consola.error).mock.calls.join(" ")).toContain("non-camel-case");
  });

  it("exempts the BCP-47 langcode level of config.systemSite.translations", () => {
    expect(
      findWrongCasedKey({ config: { systemSite: { translations: { "zh-hans": { name: "x" } } } } }),
    ).toBeNull();
    expect(
      findWrongCasedKey({
        config: { systemSite: { translations: { "zh-hans": { site_name: "x" } } } },
      }),
    ).toBe("config.systemSite.translations.zh-hans.site_name");
  });

  it("walks arrays, tolerates non-object leaves, and stops at the depth bound", () => {
    expect(findWrongCasedKey({ a: [1, "ok", { b: [{ bad_key: 1 }] }] })).toBe("a[2].b[0].bad_key");
    expect(findWrongCasedKey({ a: [1, true, null] })).toBeNull();

    let nested: Record<string, unknown> = { bad_key: 1 };

    for (let i = 0; i < 40; i += 1) nested = { down: nested };

    expect(findWrongCasedKey(nested)).toBeNull();
  });
});

/**
 * Conformance against p01-01. When p01-01's example document and its `validateDrupalConfigDocument`
 * are on branch, both are driven directly. When they are not, the check still RUNS against the
 * envelope the contract spec publishes, and this test records which of the two it used - it is
 * never skipped and never replaced by a hand-written fixture.
 */
describe("conformance to p01-01's contract", () => {
  it(`parses the ${hasExampleDocument ? "p01-01 example document" : "contract spec envelope (p01-01 not on branch)"}`, async () => {
    const document = contractDocument();

    expect(Number.isInteger(document.version)).toBe(true);
    expect(document.version).toBe(SUPPORTED_CONFIG_VERSION);
    expect(typeof document.siteCode).toBe("string");
    expect(Number.isNaN(Date.parse(document.generated))).toBe(false);
    expect(document.config.biolandSettings).toBeTruthy();
    expect(findWrongCasedKey(document)).toBeNull();
    expect(findLeakInDocument(document)).toBeNull();

    fetchImpl = async () => document;

    const result = await fetchSiteSettings(ctx);

    expect(result).toEqual({ settings: expect.any(Object), stale: false });
  });

  it("returns only BL-890 allowlisted keys, which is far less than the document carries", async () => {
    // The conformance check proves the DOCUMENT conforms; it says nothing about what the client
    // hands its caller. `sanitizeBiolandSettings` drops 18 of the 23 keys in p01-01's example
    // document - consistent with today's dmsm path, so not a regression, but worth being explicit
    // about so a consumer does not plan on a key that never arrives.
    const document = contractDocument();

    fetchImpl = async () => document;

    const result = await fetchSiteSettings(ctx);
    const offered = Object.keys(document.config.biolandSettings as Record<string, unknown>);
    const returned = Object.keys(result!.settings);

    expect(returned.length).toBeLessThanOrEqual(offered.length);
    expect(returned.every((key) => BIOLAND_SETTINGS_ALLOWLIST.includes(key as never))).toBe(true);
  });
});
