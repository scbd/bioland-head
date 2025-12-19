import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getE2EBaseURL } from '../../e2e-targets'

const E2E_BASE_URL = getE2EBaseURL()

/**
 * BL-705: Cookie Consent Styling Verification
 * 
 * Tests verify that the cookie consent banner displays with proper black background
 * and white text on initial page load across different devices and pages.
 * 
 * Critical: This test MUST NOT pre-seed cookie consent - we need to see the banner appear.
 */

async function writeEvidenceScreenshot (page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-705')
  await mkdir(dir, { recursive: true })

  const fileName = `${basename}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: false })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

test.describe('BL-705: Cookie Consent Black Background and White Text', () => {
  
  test.beforeEach(async ({ context }) => {
    // CRITICAL: Clear ALL cookies to force banner display
    // Unlike other tests, we MUST see the cookie consent banner
    await context.clearCookies()
  })

  test('cookie banner appears with black background and white text', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear cookies to ensure banner appears
    await context.clearCookies()

    // Navigate to homepage
    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    
    // Wait for client-side hydration to complete
    await page.waitForLoadState('domcontentloaded')
    await page.waitForLoadState('load')
    
    // Wait for the cookie banner to appear
    const cookieBar = page.locator('.cookieControl__Bar')
    await expect(cookieBar, 'Cookie banner should be visible').toBeVisible({ timeout: 30000 })
    
    // Wait for accept button to ensure content is loaded
    const acceptButton = page.getByText(/accept all/i)
    await expect(acceptButton).toBeVisible({ timeout: 30000 })

    // VERIFY: Background is BLACK
    const backgroundColor = await cookieBar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })
    
    // Background should be black or very dark
    expect(
      backgroundColor,
      'Background should be BLACK - rgb(0, 0, 0) or similar dark color'
    ).toMatch(/^rgb\((0|1|2|3|4|5),\s*(0|1|2|3|4|5),\s*(0|1|2|3|4|5)\)/)

    // VERIFY: Text is WHITE
    const textColor = await cookieBar.evaluate((el) => {
      const textElement = el.querySelector('h2, p, button') as HTMLElement
      return textElement ? window.getComputedStyle(textElement).color : null
    })
    
    // Text should be white rgb(255, 255, 255)
    expect(
      textColor,
      'Text should be WHITE - rgb(255, 255, 255)'
    ).toMatch(/^rgb\(25[0-5],\s*25[0-5],\s*25[0-5]\)/)
    
    // Text should NOT be black rgb(0, 0, 0)
    expect(
      textColor,
      'Text should NOT be black'
    ).not.toMatch(/^rgb\(0,\s*0,\s*0\)/)

    // VERIFY: Accept button is visible (already checked above, just re-verify)
    await expect(acceptButton, 'Accept button should be visible').toBeVisible()

    // Capture screenshot evidence
    await writeEvidenceScreenshot(page, testInfo, 'bl-705-cookie-banner-black-white')
  })

  test('cookie acceptance functionality still works', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear cookies
    await context.clearCookies()

    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    
    // Wait for cookie banner to appear
    const acceptButton = page.getByText(/accept all/i)
    await expect(acceptButton, 'Accept button should be visible').toBeVisible({ timeout: 30000 })
    
    // Click accept
    await acceptButton.click()
    
    // Wait for banner to disappear after clicking accept
    const cookieBar = page.locator('.cookieControl__Bar')
    await expect(cookieBar).toBeHidden({ timeout: 10000 })
    
    // VERIFY: Cookies were set
    const cookies = await context.cookies()
    const consentCookies = cookies.filter(c => c.name.includes('ncc_') || c.name.includes('consent'))
    expect(consentCookies.length, 'At least one consent cookie should be set').toBeGreaterThan(0)
  })

  test('mobile responsive behavior works correctly', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear cookies
    await context.clearCookies()

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    
    // Wait for client-side hydration to complete
    await page.waitForLoadState('domcontentloaded')
    await page.waitForLoadState('load')
    
    // Wait for the cookie banner to appear
    const cookieBar = page.locator('.cookieControl__Bar')
    await expect(cookieBar, 'Cookie banner should be visible on mobile').toBeVisible({ timeout: 30000 })
    
    // Wait for accept button
    const acceptButton = page.getByText(/accept all/i)
    await expect(acceptButton).toBeVisible({ timeout: 30000 })
    
    // VERIFY: Background is BLACK on mobile
    const backgroundColor = await cookieBar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })
    expect(
      backgroundColor,
      'Background should be black on mobile'
    ).toMatch(/^rgb\((0|1|2|3|4|5),\s*(0|1|2|3|4|5),\s*(0|1|2|3|4|5)\)/)
    
    // VERIFY: Text is WHITE on mobile
    const textColor = await cookieBar.evaluate((el) => {
      const textElement = el.querySelector('h2, p, button') as HTMLElement
      return textElement ? window.getComputedStyle(textElement).color : null
    })
    expect(
      textColor,
      'Text should be white on mobile'
    ).toMatch(/^rgb\(25[0-5],\s*25[0-5],\s*25[0-5]\)/)
    
    // VERIFY: Banner is responsive to mobile width
    const dimensions = await cookieBar.boundingBox()
    expect(dimensions, 'Banner should have dimensions').not.toBeNull()
    expect(dimensions!.width, 'Banner should fit within mobile viewport').toBeLessThanOrEqual(375)
    
    // VERIFY: Accept button is visible on mobile (already checked above)
    await expect(acceptButton, 'Accept button should be visible on mobile').toBeVisible()
    
    // Capture mobile screenshot evidence
    await writeEvidenceScreenshot(page, testInfo, 'bl-705-cookie-banner-mobile')
  })
})
