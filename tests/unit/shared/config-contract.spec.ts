import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateDrupalConfigDocument } from "../../fixtures/config-contract/validate-drupal-config-document";

const EXAMPLE_PATH = resolve(
  __dirname,
  "../../fixtures/config-contract/drupal-config-document.example.json",
);

const loadExample = (): Record<string, unknown> =>
  JSON.parse(readFileSync(EXAMPLE_PATH, "utf8"));

describe("site-config contract: the example Drupal config document", () => {
  it("parses as JSON", () => {
    expect(() => loadExample()).not.toThrow();
  });

  it("validates with no errors", () => {
    const result = validateDrupalConfigDocument(loadExample());

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("carries no host, credential, or key-shaped value", () => {
    const raw = readFileSync(EXAMPLE_PATH, "utf8");

    expect(raw).not.toMatch(/-----BEGIN /);
    expect(raw).not.toMatch(/mysql:\/\//);
    expect(raw).not.toMatch(/smtp:\/\//);
    expect(raw).not.toMatch(/api-key=/);
  });
});

describe("site-config contract: the four rejection classes", () => {
  it("rejects a missing version", () => {
    const doc = loadExample();
    delete doc.version;

    const result = validateDrupalConfigDocument(doc);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("version: missing or not an integer >= 1");
  });

  it("rejects a missing system.site name", () => {
    const doc = loadExample();
    const config = doc.config as Record<string, Record<string, unknown>>;
    delete config.systemSite.name;

    const result = validateDrupalConfigDocument(doc);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("systemSite.name:"))).toBe(true);
  });

  it("rejects a wrong-cased key the module failed to camelCase", () => {
    const doc = loadExample();
    const config = doc.config as Record<string, Record<string, unknown>>;
    delete config.biolandSettings.googleAnalyticsIds;
    config.biolandSettings.google_analytics_ids = "G-EXAMPLE0";

    const result = validateDrupalConfigDocument(doc);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.includes('wrong-cased key "google_analytics_ids"') &&
          e.includes("config.biolandSettings.google_analytics_ids"),
      ),
    ).toBe(true);
  });

  it("accepts a hyphenated langcode under config.systemSite.translations", () => {
    const doc = loadExample();
    const config = doc.config as Record<string, Record<string, unknown>>;
    config.systemSite.translations = {
      "zh-hans": { name: "Example site" },
      "pt-br": { name: "Example site" },
      "gsw-berne": { name: "Example site" },
    };

    const result = validateDrupalConfigDocument(doc);

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects a never-ship key at the envelope level, beside config", () => {
    const doc = loadExample();
    doc.dataBase = {};

    const result = validateDrupalConfigDocument(doc);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('never-ship key "dataBase"') && e.includes('at "dataBase"'),
      ),
    ).toBe(true);
  });

  it("rejects a never-ship key nested at any depth", () => {
    const doc = loadExample();
    const config = doc.config as Record<string, Record<string, unknown>>;
    (config.biolandSettings.config as Record<string, unknown>).dataBase = {};

    const result = validateDrupalConfigDocument(doc);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.includes('never-ship key "dataBase"') &&
          e.includes("config.biolandSettings.config.dataBase"),
      ),
    ).toBe(true);
  });
});

describe("site-config contract: every never-ship key is rejected", () => {
  const neverShip = [
    "dataBase",
    "dns",
    "drupal",
    "defaultSmtpCredentials",
    "panoramaKey",
    "auth",
    "meta",
    "root",
    "drupalRoot",
    "siteRoot",
    "dataBaseName",
    "smtpCredentials",
  ];

  it.each(neverShip)("rejects %s", (key) => {
    const doc = loadExample();
    const config = doc.config as Record<string, Record<string, unknown>>;
    config.biolandSettings[key] = "anything";

    const result = validateDrupalConfigDocument(doc);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(`never-ship key "${key}"`))).toBe(true);
  });
});

describe("site-config contract: envelope edge cases", () => {
  it.each([0, -1, -42, 1.5, "1", null, true, NaN, Infinity])(
    "rejects invalid version %s",
    (version) => {
      const result = validateDrupalConfigDocument({ ...loadExample(), version });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.startsWith("version:"))).toBe(true);
    },
  );

  it.each([1, 2, 42])("accepts positive integer version %s", (version) => {
    expect(validateDrupalConfigDocument({ ...loadExample(), version })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each([
    undefined, null, 1, "", "1", "09/15/2026", "September 15, 2026",
    "2026-09-15", "2026-09-15T12:34:56", "2026-09-15 12:34:56Z",
    "2026-02-29T12:34:56Z", "1900-02-29T00:00:00Z",
    "2026-04-31T12:34:56+05:30", "2026-02-30T12:34:56.123-04:00",
    "2026-00-15T12:34:56Z", "2026-13-15T12:34:56Z", "2026-09-00T12:34:56Z",
    "2026-09-15T25:00:00Z", "2026-09-15T12:60:00Z", "2026-09-15T12:34:60Z",
    "2026-09-15T12:34:56+24:00", "2026-09-15T12:34:56+00:60",
    "2026-09-15T12:34:56.Z", "2026-09-15T12:34:56Z\n",
  ])("rejects invalid generated timestamp %s", (generated) => {
    const result = validateDrupalConfigDocument({ ...loadExample(), generated });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("generated: missing or not an ISO-8601 timestamp");
  });

  it.each([
    "2026-09-15T00:00:00Z", "2026-12-31T23:59:59Z",
    "2024-02-29T12:34:56Z", "2000-02-29T00:00:00Z", "0096-02-29T00:00:00Z",
    "2026-09-15T12:34:56.1Z", "2026-09-15T12:34:56.123456789Z",
    "2026-09-15T12:34:56+05:30", "2026-09-15T12:34:56.123-04:00",
    "2026-09-15T12:34:56+0530", "2026-09-15T12:34:56.123-0400",
    "2024-03-01T00:00:00+14:00", "2024-02-29T23:59:59-12:00",
  ])("accepts ISO generated timestamp %s", (generated) => {
    expect(validateDrupalConfigDocument({ ...loadExample(), generated })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects a non-object document", () => {
    expect(validateDrupalConfigDocument(null).valid).toBe(false);
    expect(validateDrupalConfigDocument("{}").valid).toBe(false);
  });

  it("rejects a missing system.date timezone", () => {
    const doc = loadExample();
    const config = doc.config as Record<string, unknown>;
    delete config.systemDate;

    const result = validateDrupalConfigDocument(doc);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("systemDate.timezone.default:"))).toBe(true);
  });
});
