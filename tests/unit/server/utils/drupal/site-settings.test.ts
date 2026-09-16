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
  CONFIG_API_KEY_HEADER,
  CONFIG_DOCUMENT_PATH,
  CONFIG_FETCH_TIMEOUT_MS,
  SUPPORTED_CONFIG_VERSION,
  type DrupalConfigDocument,
  type LastKnownGoodRecord,
} from "../../../../../server/utils/drupal/site-settings";

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

const contractDocument = (): DrupalConfigDocument =>
  EXAMPLE_DOCUMENT_PATH
    ? (JSON.parse(readFileSync(EXAMPLE_DOCUMENT_PATH, "utf8")) as DrupalConfigDocument)
    : structuredClone(CONTRACT_ENVELOPE);

let fetchCalls: Array<{ uri: string; options: Record<string, unknown> }> = [];
let fetchImpl: () => Promise<unknown> = async () => contractDocument();

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
  fetchImpl = async () => contractDocument();
  readSpy.mockClear();
  vi.mocked(consola.error).mockClear();

  globalThis.useRuntimeConfig = () => ({ apiKey: API_KEY, public: {} });
  globalThis.$fetchBaseOptions = (options = {}) => ({ method: "GET", retry: 3, ...options });
  globalThis.$fetch = (uri: string, options: Record<string, unknown>) => {
    fetchCalls.push({ uri, options });

    return fetchImpl();
  };

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
});
