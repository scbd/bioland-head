import type { BrowserContext } from '@playwright/test'

/**
 * Pre-seed consent cookies so the cookie bar does not cover the UI.
 *
 * Requested values:
 * - ncc_c = bl2ga
 * - ncc_e = bl2~ga
 *
 * Note: nuxt-cookie-control splits enabled ids with `~`.
 */
export async function seedConsentCookies (context: BrowserContext, baseURL: string): Promise<void> {
  const cookieUrl = `${new URL(baseURL).origin}/`
  const oneYearFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365

  await context.addCookies([
    { name: 'ncc_c', value: 'bl2ga', url: cookieUrl, expires: oneYearFromNow, sameSite: 'Strict' },
    { name: 'ncc_e', value: 'bl2~ga', url: cookieUrl, expires: oneYearFromNow, sameSite: 'Strict' },
  ])
}
