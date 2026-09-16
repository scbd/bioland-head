import { describe, expectTypeOf, it } from 'vitest'

import { toPublicConfig } from '../../../../../server/utils/site-registry/projection'

import type {
  PublicSiteConfigKey,
  SiteConfig
} from '../../../../../server/utils/site-registry/projection'
import type { MultiSiteConfigInput, SiteConfigInput } from '../../../../../shared/types/site-config'

/**
 * Type-level gate for the public projection (p02-03, BL-983).
 *
 * `expectTypeOf` is compile-time only and a runtime no-op; this file is a real check solely
 * because `vitest.config.ts` enables `test.typecheck` over `tests/unit/**\/*.test-d.ts`
 * (tsconfig.vitest.json). Do not rename it to `.test.ts` — the assertions would all silently pass.
 *
 * What it pins: the exported signature, and the fact that `SiteConfig` REQUIRES every allowlisted
 * member. Requiredness is the mechanism that turns a forgotten key in `toPublicConfig` into a
 * compile error instead of a silently dropped field.
 */
/** The keys of `T` that may be omitted entirely. `never` when every member is required. */
type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T]

describe('toPublicConfig signature', () => {
  it('is (site: SiteConfigInput, multiSiteConfig: MultiSiteConfigInput) => SiteConfig', () => {
    expectTypeOf(toPublicConfig).parameter(0).toEqualTypeOf<SiteConfigInput>()
    expectTypeOf(toPublicConfig).parameter(1).toEqualTypeOf<MultiSiteConfigInput>()
    expectTypeOf(toPublicConfig).returns.toEqualTypeOf<SiteConfig>()
  })
})

describe('SiteConfig shape', () => {
  it('requires every allowlisted key as a property', () => {
    expectTypeOf<keyof SiteConfig>().toEqualTypeOf<PublicSiteConfigKey>()
    // `object extends Pick<T, K>` is true only when K may be omitted. NO member may be omitted —
    // that requiredness is the mechanism that makes a forgotten key a compile error in
    // `toPublicConfig`, so it is asserted over the whole key set rather than a sample.
    expectTypeOf<OptionalKeys<SiteConfig>>().toEqualTypeOf<never>()
    expectTypeOf<object extends Pick<SiteConfig, 'country'> ? true : false>().toEqualTypeOf<false>()
    expectTypeOf<object extends Pick<SiteConfig, 'theme'> ? true : false>().toEqualTypeOf<false>()
  })

  it('narrows hasBl1 to a plain boolean (R3), unlike the pre-cutover wire type', () => {
    expectTypeOf<SiteConfig['hasBl1']>().toEqualTypeOf<boolean>()
  })

  it('has no member for a never-ship or stripped key', () => {
    expectTypeOf<PublicSiteConfigKey>().not.toEqualTypeOf<'redirect'>()
    expectTypeOf<Extract<PublicSiteConfigKey, 'redirect' | 'meta' | 'aliases' | 'runTime'>>()
      .toEqualTypeOf<never>()
  })
})
