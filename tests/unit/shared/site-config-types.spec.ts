import { describe, expectTypeOf, it } from "vitest";

import type {
  DmsmConfig,
  MultiSiteConfigInput,
  SiteConfigInput,
  SiteRunTime,
  SiteTheme,
} from "../../../shared/types";

/**
 * Type-level check: true when property `K` may be omitted from `T` entirely (i.e. `K` is an
 * optional member), false when `T` requires it. `expectTypeOf` has no built-in "is this property
 * optional" matcher, so this is the local equivalent — used below for `country`, `countries`, and
 * `theme` per the observed-corpus optionality counts in docs/specs/site-config-contract.md.
 */
type isOptional<T, K extends keyof T> = object extends Pick<T, K> ? true : false;

/**
 * Type-level assertions for the completed config types (BL-965 / p01-02).
 *
 * There is no `typecheck` script and no `vue-tsc` in this repo (see
 * docs/specs/site-config-contract.md and phase-01/context.md) — `expectTypeOf` plus human review
 * is the whole verification for this types-only task. Every assertion here is checked entirely at
 * compile time; the `it()` bodies never execute meaningful runtime code.
 */
describe("DmsmConfig: optionality per the observed corpus (docs/specs/site-config-contract.md)", () => {
  it("country is optional (208/211 present)", () => {
    expectTypeOf<isOptional<DmsmConfig, "country">>().toEqualTypeOf<true>();
    expectTypeOf<DmsmConfig["country"]>().toEqualTypeOf<string | undefined>();
  });

  it("countries is optional (170/211 present)", () => {
    expectTypeOf<isOptional<DmsmConfig, "countries">>().toEqualTypeOf<true>();
    expectTypeOf<DmsmConfig["countries"]>().toEqualTypeOf<string[] | undefined>();
  });

  it("theme is optional (176/211 present) and typed as SiteTheme", () => {
    expectTypeOf<isOptional<DmsmConfig, "theme">>().toEqualTypeOf<true>();
    expectTypeOf<DmsmConfig["theme"]>().toEqualTypeOf<SiteTheme | undefined>();
  });
});

describe("DmsmConfig: the four previously-missing fields (p01-02 step 3)", () => {
  it("carries published", () => {
    expectTypeOf<DmsmConfig>().toHaveProperty("published");
    expectTypeOf<DmsmConfig["published"]>().toEqualTypeOf<boolean | undefined>();
  });

  it("carries hasBl1, typed honestly as boolean | string (R3 decision)", () => {
    expectTypeOf<DmsmConfig>().toHaveProperty("hasBl1");
    expectTypeOf<DmsmConfig["hasBl1"]>().toEqualTypeOf<boolean | string | undefined>();
  });

  it("carries geoBonPage", () => {
    expectTypeOf<DmsmConfig>().toHaveProperty("geoBonPage");
    expectTypeOf<DmsmConfig["geoBonPage"]>().toEqualTypeOf<string | undefined>();
  });

  it("carries scbd", () => {
    expectTypeOf<DmsmConfig>().toHaveProperty("scbd");
    expectTypeOf<DmsmConfig["scbd"]>().toEqualTypeOf<boolean | undefined>();
  });
});

describe("DmsmConfig: runTime is a named SiteRunTime, not Record<string, unknown>", () => {
  it("runTime is typed as SiteRunTime | undefined", () => {
    expectTypeOf<DmsmConfig["runTime"]>().toEqualTypeOf<SiteRunTime | undefined>();
  });

  it("SiteRunTime exposes only the documented public members", () => {
    expectTypeOf<SiteRunTime>().toHaveProperty("env");
    expectTypeOf<SiteRunTime>().toHaveProperty("multiSiteCode");
    expectTypeOf<SiteRunTime>().toHaveProperty("host");
    expectTypeOf<SiteRunTime>().toHaveProperty("countries");
    expectTypeOf<SiteRunTime>().toHaveProperty("theme");
    expectTypeOf<SiteRunTime>().toHaveProperty("i18n");
    expectTypeOf<SiteRunTime>().toHaveProperty("settings");
    expectTypeOf<SiteRunTime>().toHaveProperty("biolandSettings");
  });

  it("never exposes a secret runTime member (R2 never-ship list)", () => {
    expectTypeOf<SiteRunTime>().not.toHaveProperty("dataBase");
    expectTypeOf<SiteRunTime>().not.toHaveProperty("dns");
    expectTypeOf<SiteRunTime>().not.toHaveProperty("smtpCredentials");
    expectTypeOf<SiteRunTime>().not.toHaveProperty("dataBaseName");
    expectTypeOf<SiteRunTime>().not.toHaveProperty("root");
    expectTypeOf<SiteRunTime>().not.toHaveProperty("drupalRoot");
    expectTypeOf<SiteRunTime>().not.toHaveProperty("siteRoot");
  });
});

describe("SiteConfigInput and MultiSiteConfigInput: exported and structurally distinct", () => {
  it("SiteConfigInput carries per-site-only fields absent from MultiSiteConfigInput", () => {
    expectTypeOf<SiteConfigInput>().toHaveProperty("siteCode");
    expectTypeOf<SiteConfigInput>().toHaveProperty("hasBl1");
    expectTypeOf<MultiSiteConfigInput>().not.toHaveProperty("siteCode");
    expectTypeOf<MultiSiteConfigInput>().not.toHaveProperty("hasBl1");
  });

  it("MultiSiteConfigInput carries multiSite-only secret fields absent from SiteConfigInput", () => {
    expectTypeOf<MultiSiteConfigInput>().toHaveProperty("dataBase");
    expectTypeOf<MultiSiteConfigInput>().toHaveProperty("panoramaKey");
    expectTypeOf<SiteConfigInput>().not.toHaveProperty("dataBase");
    expectTypeOf<SiteConfigInput>().not.toHaveProperty("panoramaKey");
  });

  it("both types are not assignable to one another (structurally distinct)", () => {
    expectTypeOf<SiteConfigInput>().not.toEqualTypeOf<MultiSiteConfigInput>();
    expectTypeOf<MultiSiteConfigInput>().not.toMatchTypeOf<SiteConfigInput>();
    expectTypeOf<SiteConfigInput>().not.toMatchTypeOf<MultiSiteConfigInput>();
  });
});
