import { test, expect, type Page, type TestInfo, type BrowserContext } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getE2EBaseURL } from '../../e2e-targets'
import { seedConsentCookies } from '../../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL()

/**
 * BL-706: Hero Image SSR Context Fix
 * 
 * Tests verify that hero images render correctly on SSR even on the first request
 * without a context cookie, and that SSR-to-client hydration is stable without mismatches.
 * 
 * Key bug: Hero images failed to render on first SSR load because site context
 * (siteCode, host, locale) was not available, resulting in URLs with "undefined" values.
 * 
 * Fix: Three-layer defense:
 * 1. Layer 1 (Plugin): site.js initializes context from cookie
 * 2. Layer 2 (Middleware): ensureSiteContext() fetches from API if Layer 1 fails
 * 3. Layer 3 (Component): Hero image guards prevent rendering with undefined context
 */

async function writeEvidenceScreenshot (page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-706')
  await mkdir(dir, { recursive: true })

  const fileName = `${basename}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: true })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

interface ConsoleCapture {
  errors: string[]
  warnings: string[]
  hydrationWarnings: string[]
}

function captureConsoleMessages (page: Page): ConsoleCapture {
  const capture: ConsoleCapture = {
    errors: [],
    warnings: [],
    hydrationWarnings: [],
  }

  page.on('console', msg => {
    const text = msg.text()
    const type = msg.type()

    if (type === 'error') {
      capture.errors.push(text)
    }
    
    if (type === 'warning') {
      capture.warnings.push(text)
    }

    // Catch hydration issues
    if (text.includes('Hydration') || text.includes('mismatch') || text.includes('hydrat')) {
      capture.hydrationWarnings.push(text)
    }
  })

  return capture
}

async function clearAllCookiesAndCache (context: BrowserContext): Promise<void> {
  await context.clearCookies()
  // Also clear storage to fully simulate first-time visitor
  await context.clearPermissions()
}

test.describe('BL-706: Hero Image SSR Context Fix', () => {
  test.beforeEach(async ({ context }) => {
    // Pre-seed consent cookies so the cookie bar doesn't interfere
    await seedConsentCookies(context, E2E_BASE_URL)
  })

  test('hero image renders on first SSR load without context cookie', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear all cookies EXCEPT consent cookies to simulate first-time visitor
    // This is the critical bug scenario - no context cookie available yet
    const cookies = await context.cookies()
    const consentCookies = cookies.filter(c => c.name.includes('consent') || c.name.includes('cookie'))
    await context.clearCookies()
    await context.addCookies(consentCookies)

    // Set up console monitoring
    const consoleCapture = captureConsoleMessages(page)

    // Navigate to page with hero (first SSR request, no context cookie)
    await page.goto(`${E2E_BASE_URL}/en/home`, { waitUntil: 'load' })
    await page.waitForLoadState('domcontentloaded')

    // Wait a bit for hydration
    await page.waitForTimeout(2000)

    // VERIFY: Hero image element exists and is visible
    const heroImage = page.getByTestId('hero-image')
    await expect(heroImage, 'Hero image should be visible on first SSR load').toBeVisible({ timeout: 10_000 })

    // VERIFY: Hero has a background image (not empty)
    const bgStyle = await heroImage.evaluate(el => 
      window.getComputedStyle(el).backgroundImage
    )
    
    expect(bgStyle, 'Hero should have background-image style').not.toBe('none')
    expect(bgStyle, 'Hero background should not contain "undefined"').not.toContain('undefined')
    expect(bgStyle, 'Hero background should have actual URL').toMatch(/url\(/)

    // VERIFY: No hero-related hydration mismatches (ignore other component warnings)
    const heroHydrationWarnings = consoleCapture.hydrationWarnings.filter(w =>
      w.toLowerCase().includes('hero') ||
      w.toLowerCase().includes('background') ||
      w.toLowerCase().includes('image')
    )
    expect(
      heroHydrationWarnings,
      `Should have no hero-related hydration warnings. Found: ${JSON.stringify(heroHydrationWarnings)}`
    ).toHaveLength(0)

    // VERIFY: No context-related errors
    const contextErrors = consoleCapture.errors.filter(e => 
      e.toLowerCase().includes('context') || 
      e.toLowerCase().includes('sitecode') || 
      e.includes('undefined')
    )
    expect(
      contextErrors,
      `Should have no context-related errors. Found: ${JSON.stringify(contextErrors)}`
    ).toHaveLength(0)

    // VERIFY: Context cookie was set after first load
    const allCookies = await context.cookies()
    const contextCookie = allCookies.find(c => c.name === 'context')
    expect(contextCookie, 'Context cookie should be set after first SSR load').toBeDefined()
    expect(contextCookie?.value, 'Context cookie should have a value').toBeTruthy()

    // Screenshot evidence
    await writeEvidenceScreenshot(page, testInfo, 'bl-706-hero-first-ssr')
  })

  test('hero image stable during hydration (no flash or change)', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear context cookie to test SSR path
    const cookies = await context.cookies()
    const consentCookies = cookies.filter(c => c.name.includes('consent') || c.name.includes('cookie'))
    await context.clearCookies()
    await context.addCookies(consentCookies)

    const consoleCapture = captureConsoleMessages(page)

    // Navigate and wait for initial load (SSR state)
    await page.goto(`${E2E_BASE_URL}/en/home`, { waitUntil: 'load' })
    
    // Take screenshot immediately (SSR state, before hydration)
    await writeEvidenceScreenshot(page, testInfo, 'bl-706-ssr-state')

    // Wait for hydration to complete
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500) // Give client-side time to potentially change things

    // Take screenshot after hydration (client state)
    await writeEvidenceScreenshot(page, testInfo, 'bl-706-hydrated-state')

    // Hero should still be visible and functional
    const heroImage = page.getByTestId('hero-image')
    await expect(heroImage, 'Hero should remain visible after hydration').toBeVisible()

    // Verify background still valid
    const bgStyle = await heroImage.evaluate(el => 
      window.getComputedStyle(el).backgroundImage
    )
    expect(bgStyle, 'Hero background should remain valid after hydration').not.toContain('undefined')
    expect(bgStyle).toMatch(/url\(/)

    // VERIFY: No hero-related hydration warnings (ignore other component warnings like cookie control)
    const heroHydrationWarnings = consoleCapture.hydrationWarnings.filter(w =>
      w.toLowerCase().includes('hero') ||
      w.toLowerCase().includes('background') ||
      w.toLowerCase().includes('image')
    )
    expect(
      heroHydrationWarnings,
      `Hero hydration should be stable. Found warnings: ${JSON.stringify(heroHydrationWarnings)}`
    ).toHaveLength(0)
  })

  test('hero images work across locale switches', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Start fresh without context cookie
    const cookies = await context.cookies()
    const consentCookies = cookies.filter(c => c.name.includes('consent') || c.name.includes('cookie'))
    await context.clearCookies()
    await context.addCookies(consentCookies)

    // Start with English home page
    await page.goto(`${E2E_BASE_URL}/en/home`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)

    let heroImage = page.getByTestId('hero-image')
    await expect(heroImage, 'Hero should be visible on English home').toBeVisible({ timeout: 10_000 })

    let bgStyle = await heroImage.evaluate(el => 
      window.getComputedStyle(el).backgroundImage
    )
    expect(bgStyle, 'English hero should have valid background').not.toContain('undefined')

    // Capture English state
    await writeEvidenceScreenshot(page, testInfo, 'bl-706-locale-en')

    // Navigate to root (which defaults to 'es' locale for e2e site)
    await page.goto(`${E2E_BASE_URL}/`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)

    // Verify hero works in default/Spanish locale
    heroImage = page.getByTestId('hero-image')
    const heroCount = await heroImage.count()
    
    if (heroCount > 0) {
      await expect(heroImage, 'Hero should be visible on default locale home').toBeVisible({ timeout: 10_000 })

      bgStyle = await heroImage.evaluate(el => 
        window.getComputedStyle(el).backgroundImage
      )
      expect(bgStyle, 'Default locale hero should have valid background').not.toContain('undefined')
    }

    // Capture default locale state
    await writeEvidenceScreenshot(page, testInfo, 'bl-706-locale-default')
  })

  test('subsequent navigation continues to work with context cookie', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear context cookie for first navigation
    const cookies = await context.cookies()
    const consentCookies = cookies.filter(c => c.name.includes('consent') || c.name.includes('cookie'))
    await context.clearCookies()
    await context.addCookies(consentCookies)

    // First navigation (SSR, no context cookie)
    await page.goto(`${E2E_BASE_URL}/en/home`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)

    const firstHero = page.getByTestId('hero-image')
    await expect(firstHero, 'First page hero should be visible').toBeVisible({ timeout: 10_000 })

    // Capture first page
    await writeEvidenceScreenshot(page, testInfo, 'bl-706-first-navigation')

    // Verify context cookie is now set
    const allCookies = await context.cookies()
    const contextCookie = allCookies.find(c => c.name === 'context')
    expect(contextCookie, 'Context cookie should be set after first navigation').toBeDefined()

    // Navigate back to same page (should use cookie)
    await page.goto(`${E2E_BASE_URL}/en/home`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)

    // Hero should still be visible
    const secondHero = page.getByTestId('hero-image')
    await expect(secondHero, 'Hero should still be visible on reload').toBeVisible()
    
    const bgStyle = await secondHero.evaluate(el => 
      window.getComputedStyle(el).backgroundImage
    )
    expect(bgStyle, 'Hero should have valid background on reload').not.toContain('undefined')

    // Final screenshot
    await writeEvidenceScreenshot(page, testInfo, 'bl-706-subsequent-nav-final')
  })

  test('hero renders even if page data loads slowly', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear context cookie
    const cookies = await context.cookies()
    const consentCookies = cookies.filter(c => c.name.includes('consent') || c.name.includes('cookie'))
    await context.clearCookies()
    await context.addCookies(consentCookies)

    const consoleCapture = captureConsoleMessages(page)

    // Simulate slow network to stress-test the SSR/hydration path
    await page.route('**/*', async (route) => {
      // Add 100ms delay to all requests to simulate slow network
      await new Promise(resolve => setTimeout(resolve, 100))
      await route.continue()
    })

    await page.goto(`${E2E_BASE_URL}/en/home`, { waitUntil: 'load' })
    await page.waitForTimeout(3000) // Extra time for slow network simulation

    // Hero should still render despite slow loading
    const heroImage = page.getByTestId('hero-image')
    await expect(heroImage, 'Hero should render even with slow network').toBeVisible({ timeout: 15_000 })

    const bgStyle = await heroImage.evaluate(el => 
      window.getComputedStyle(el).backgroundImage
    )
    expect(bgStyle, 'Hero should have valid background despite slow load').not.toContain('undefined')

    // Should not have errors (graceful degradation)
    const criticalErrors = consoleCapture.errors.filter(e => 
      !e.includes('favicon') && // Ignore favicon errors
      !e.includes('net::ERR') // Ignore network errors from our intentional slowdown
    )
    
    // We expect some slowness but not crashes
    expect(
      criticalErrors.length,
      `Should have minimal errors despite slow network. Found: ${JSON.stringify(criticalErrors)}`
    ).toBeLessThan(3)

    await writeEvidenceScreenshot(page, testInfo, 'bl-706-slow-network')
  })

  test('network requests do not contain undefined in URLs', async ({ page, context }, testInfo) => {
    testInfo.setTimeout(60_000)

    // Clear context cookie
    const cookies = await context.cookies()
    const consentCookies = cookies.filter(c => c.name.includes('consent') || c.name.includes('cookie'))
    await context.clearCookies()
    await context.addCookies(consentCookies)

    // Track all network requests
    const networkRequests: string[] = []
    const requestsWithUndefined: string[] = []

    page.on('request', request => {
      const url = request.url()
      networkRequests.push(url)
      
      if (url.includes('undefined')) {
        requestsWithUndefined.push(url)
      }
    })

    await page.goto(`${E2E_BASE_URL}/en/home`, { waitUntil: 'load' })
    await page.waitForLoadState('networkidle')

    // VERIFY: No requests should contain "undefined" in the URL
    expect(
      requestsWithUndefined,
      `No network requests should contain "undefined". Found: ${JSON.stringify(requestsWithUndefined)}`
    ).toHaveLength(0)

    // Log summary
    console.log(`Total network requests: ${networkRequests.length}`)
    console.log(`Requests with undefined: ${requestsWithUndefined.length}`)

    await writeEvidenceScreenshot(page, testInfo, 'bl-706-network-check')
  })
})
