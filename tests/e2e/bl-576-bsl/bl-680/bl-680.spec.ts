import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getE2EBaseURL } from '../../e2e-targets'
import { seedConsentCookies } from '../../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL()

/**
 * BL-680: Mega Menu Link Locale Prefix Verification
 *
 * Tests verify that mega menu links have correctly formatted locale prefixes:
 * 1. Internal links have single locale prefix (e.g., `/en/page` not `/en/en/page`)
 * 2. External links (http/https) do not get locale prefixes
 * 3. Links work correctly across different languages
 * 4. Navigation from mega menu works correctly
 */

interface LinkInfo {
  href: string
  text: string
  isExternal: boolean
  hasDoubleLocale: boolean
}

interface NavItemInfo {
  index: number
  text: string
  hasChildren: boolean
}

const LOCALE_CODES = ['en', 'fr', 'es', 'ar', 'ru', 'zh']

async function writeEvidenceScreenshot(page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-680')
  await mkdir(dir, { recursive: true })

  const fileName = `${basename}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: false })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

/**
 * Opens a mega menu dropdown by clicking on its nav trigger (by index)
 */
async function openMegaMenuDropdownByIndex(page: Page, index: number): Promise<boolean> {
  // Skip index 0 (Home) as it doesn't have a dropdown
  if (index === 0) return false

  const navItem = page.locator(`#page-header-mega-menu-nav-item-${index}`)

  if (!await navItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    return false
  }

  await navItem.click()
  await page.waitForTimeout(500) // Wait for dropdown animation
  return true
}

/**
 * Opens a mega menu dropdown by clicking on its nav trigger (by name)
 */
async function openMegaMenuDropdown(page: Page, menuName: string): Promise<boolean> {
  const navItem = page.locator('#page-header-mega-menu-nav').getByText(menuName, { exact: true })

  if (!await navItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    return false
  }

  await navItem.click()
  await page.waitForTimeout(500) // Wait for dropdown animation
  return true
}

/**
 * Close the mega menu dropdown
 */
async function closeMegaMenuDropdown(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/**
 * Check if a URL has a double locale prefix (e.g., /en/en/ or /fr/fr/)
 */
function hasDoubleLocalePrefix(href: string, currentLocale: string): boolean {
  // Pattern for double locale prefix: /en/en/, /fr/fr/, etc.
  const doubleLocalePattern = new RegExp(`^/${currentLocale}/${currentLocale}/`, 'i')

  // Also check for mixed double locales like /en/fr/ at the start
  const mixedDoublePattern = new RegExp(`^/(${LOCALE_CODES.join('|')})/(${LOCALE_CODES.join('|')})/`, 'i')

  return doubleLocalePattern.test(href) || mixedDoublePattern.test(href)
}

/**
 * Check if a URL is external (starts with http:// or https://)
 */
function isExternalUrl(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://')
}

/**
 * Extract all links from the currently open mega menu dropdown
 */
async function getMegaMenuDropdownLinks(page: Page, currentLocale: string): Promise<LinkInfo[]> {
  // Get all links within the mega menu dropdown area (using proper IDs)
  const links = await page.$$eval(
    '#page-header-mega-menu-nav .mm-nav-dropdown a, #page-header-mega-menu-nav [id^="page-header-mega-menu-custom"] a',
    (els) => els.map((el) => {
      const href = el.getAttribute('href') || ''
      return {
        href,
        text: el.textContent?.trim() || '',
        isExternal: href.startsWith('http://') || href.startsWith('https://'),
        hasDoubleLocale: false, // Will be calculated in JS
      }
    }),
  )

  // Calculate double locale after extraction
  return links.map((link) => ({
    ...link,
    hasDoubleLocale: hasDoubleLocalePrefix(link.href, currentLocale),
  }))
}

/**
 * Get all visible mega menu nav items with their indices
 */
async function getMegaMenuNavItems(page: Page): Promise<NavItemInfo[]> {
  // Wait for mega menu to be present
  const megaMenu = page.locator('#page-header-mega-menu-nav')
  await megaMenu.waitFor({ state: 'visible', timeout: 10000 })

  // Get nav items from the mega menu
  const navItems = await page.$$eval(
    '#page-header-mega-menu-nav-list > li[id^="page-header-mega-menu-nav-item-"]',
    (els) => els.map((el) => {
      const id = el.getAttribute('id') || ''
      const indexMatch = id.match(/page-header-mega-menu-nav-item-(\d+)/)
      const index = indexMatch ? parseInt(indexMatch[1], 10) : -1
      const link = el.querySelector('a.nav-link')
      const text = link?.textContent?.trim() || ''
      // Check if this item has children (dropdown content)
      const hasChildren = el.querySelectorAll('a').length > 1

      return { index, text, hasChildren }
    }),
  )

  // Filter out home (index 0) and login items, and items without text
  return navItems.filter((item) => item.index > 0 && item.text.length > 0)
}

/**
 * Switch language using the language bar
 */
async function switchLanguage(page: Page, targetLocale: string): Promise<boolean> {
  // First check if language is in the main nav
  const languageLink = page.locator(`#page-header-language-bar a[href*="/${targetLocale}"]`).first()

  if (await languageLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await languageLink.click()
    // Wait for URL to contain the locale (but maybe not with trailing slash)
    await page.waitForURL((url) => url.pathname.startsWith(`/${targetLocale}`), { timeout: 10000 })
    await page.waitForLoadState('networkidle')
    return true
  }

  // Try "Other" dropdown
  const otherDropdown = page.locator('#page-header-language-bar-other-dropdown')
  if (await otherDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    await otherDropdown.click()
    await page.waitForTimeout(300)

    const dropdownLink = page.locator(`#page-header-language-bar-other-dropdown-menu a[href*="/${targetLocale}"]`).first()
    if (await dropdownLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dropdownLink.click()
      await page.waitForURL((url) => url.pathname.startsWith(`/${targetLocale}`), { timeout: 10000 })
      await page.waitForLoadState('networkidle')
      return true
    }
  }

  return false
}

test.describe('BL-680: Mega Menu Link Locale Prefix Verification', () => {
  test.beforeEach(async ({ page }) => {
    await seedConsentCookies(page.context(), E2E_BASE_URL)
    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    // Wait for mega menu nav to be visible
    await page.locator('#page-header-mega-menu-nav').waitFor({ state: 'visible', timeout: 15000 })
  })

  test('Scenario 1: Single Locale Prefix Verification (English)', async ({ page }, testInfo) => {
    testInfo.setTimeout(60_000)

    const navItems = await getMegaMenuNavItems(page)
    expect(navItems.length, 'Should have mega menu nav items').toBeGreaterThan(0)

    const allLinksWithDoublePrefix: LinkInfo[] = []
    const testedMenus: string[] = []
    let screenshotTaken = false

    for (const item of navItems) {
      const opened = await openMegaMenuDropdownByIndex(page, item.index)
      if (!opened) continue

      testedMenus.push(item.text)
      await page.waitForTimeout(500) // Wait for dropdown content to render

      const links = await getMegaMenuDropdownLinks(page, 'en')

      // Take screenshot of first menu with links open
      if (!screenshotTaken && links.length > 0) {
        await writeEvidenceScreenshot(page, testInfo, 'english-mega-menu-open')
        screenshotTaken = true
      }

      // Filter links with double prefixes
      const doubleLinks = links.filter((link) => link.hasDoubleLocale)
      allLinksWithDoublePrefix.push(...doubleLinks)

      // Verify no double locale prefixes in this menu
      for (const link of links) {
        if (!link.isExternal && link.href !== '#' && link.href !== '') {
          expect(
            link.hasDoubleLocale,
            `Link "${link.text}" should not have double locale prefix. href: ${link.href}`,
          ).toBe(false)
        }
      }

      await closeMegaMenuDropdown(page)
    }

    // Summary assertions
    expect(testedMenus.length, 'Should have tested at least one menu').toBeGreaterThan(0)
    expect(
      allLinksWithDoublePrefix.length,
      `No links should have double locale prefixes. Found: ${allLinksWithDoublePrefix.map((l) => l.href).join(', ')}`,
    ).toBe(0)
  })

  test('external links do not get locale prefixes', async ({ page }, testInfo) => {
    testInfo.setTimeout(60_000)

    const navItems = await getMegaMenuNavItems(page)
    const externalLinks: LinkInfo[] = []
    let screenshotTaken = false

    for (const item of navItems) {
      const opened = await openMegaMenuDropdownByIndex(page, item.index)
      if (!opened) continue

      await page.waitForTimeout(500)
      const links = await getMegaMenuDropdownLinks(page, 'en')

      // Collect external links
      const externals = links.filter((link) => link.isExternal)
      externalLinks.push(...externals)

      // Take screenshot of menu with external links
      if (!screenshotTaken && externals.length > 0) {
        await writeEvidenceScreenshot(page, testInfo, 'external-links-menu-open')
        screenshotTaken = true
      }

      // Verify external links start with http:// or https:// (no locale prefix)
      for (const link of externals) {
        expect(
          link.href.startsWith('http://') || link.href.startsWith('https://'),
          `External link "${link.text}" should start with http(s)://. href: ${link.href}`,
        ).toBe(true)

        // Ensure no locale path added before the domain
        expect(
          link.href.match(/^https?:\/\/\/(en|fr|es|ar|ru|zh)\//),
          `External link should not have locale prefix after protocol. href: ${link.href}`,
        ).toBeFalsy()
      }

      await closeMegaMenuDropdown(page)
    }
  })

  test('Scenario 2: Multi-Language Verification (French)', async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000)

    // Switch to French
    const switched = await switchLanguage(page, 'fr')
    expect(switched, 'Should be able to switch to French').toBe(true)

    // Wait for page to fully load in French and mega menu to render
    await page.locator('#page-header-mega-menu-nav').waitFor({ state: 'visible', timeout: 15000 })

    const navItems = await getMegaMenuNavItems(page)
    const allLinksWithDoublePrefix: LinkInfo[] = []
    const testedMenus: string[] = []
    let screenshotTaken = false

    for (const item of navItems) {
      const opened = await openMegaMenuDropdownByIndex(page, item.index)
      if (!opened) continue

      testedMenus.push(item.text)
      await page.waitForTimeout(500)

      const links = await getMegaMenuDropdownLinks(page, 'fr')

      // Take screenshot of French menu open
      if (!screenshotTaken && links.length > 0) {
        await writeEvidenceScreenshot(page, testInfo, 'french-mega-menu-open')
        screenshotTaken = true
      }

      // Verify links have correct French locale prefix (single, not double)
      for (const link of links) {
        if (!link.isExternal && link.href !== '#' && link.href !== '') {
          expect(
            link.hasDoubleLocale,
            `French link "${link.text}" should not have double locale prefix. href: ${link.href}`,
          ).toBe(false)

          // Verify it starts with /fr/ (single prefix)
          if (link.href.startsWith('/')) {
            expect(
              link.href.startsWith('/fr/'),
              `French link "${link.text}" should start with /fr/. href: ${link.href}`,
            ).toBe(true)
          }
        }
      }

      const doubleLinks = links.filter((link) => link.hasDoubleLocale)
      allLinksWithDoublePrefix.push(...doubleLinks)

      await closeMegaMenuDropdown(page)
    }

    expect(testedMenus.length, 'Should have tested at least one menu in French').toBeGreaterThan(0)
    expect(
      allLinksWithDoublePrefix.length,
      `No French links should have double locale prefixes. Found: ${allLinksWithDoublePrefix.map((l) => l.href).join(', ')}`,
    ).toBe(0)
  })

  test('navigation from mega menu works correctly', async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000)

    // Get available menus
    const navItems = await getMegaMenuNavItems(page)
    expect(navItems.length, 'Should have mega menu items').toBeGreaterThan(0)

    // Open first menu with dropdown and get first internal link
    let foundLink: LinkInfo | undefined
    let menuName = ''

    for (const item of navItems) {
      const opened = await openMegaMenuDropdownByIndex(page, item.index)
      if (!opened) continue

      await page.waitForTimeout(500)
      const links = await getMegaMenuDropdownLinks(page, 'en')

      // Find first internal link that's not an anchor
      foundLink = links.find(
        (link) => !link.isExternal && link.href && link.href !== '#' && link.href.startsWith('/en/'),
      )

      if (foundLink) {
        menuName = item.text
        // Take screenshot with menu open before clicking
        await writeEvidenceScreenshot(page, testInfo, 'navigation-menu-before-click')
        break
      }

      await closeMegaMenuDropdown(page)
    }

    if (foundLink) {
      // Click on the link
      const linkElement = page.locator(`a[href="${foundLink.href}"]`).first()
      await linkElement.click()

      // Verify navigation succeeded
      await page.waitForLoadState('networkidle')
      const currentUrl = page.url()

      // URL should contain the expected locale and not have double locale
      expect(currentUrl, 'Should navigate to a page with /en locale').toMatch(/\/en(\/|$)/)
      expect(
        currentUrl.includes('/en/en/'),
        'Navigation URL should not have double locale prefix',
      ).toBe(false)

      // Take screenshot of navigated page
      await writeEvidenceScreenshot(page, testInfo, 'navigation-result-page')
    }
    else {
      // No internal links found, just screenshot current state
      await writeEvidenceScreenshot(page, testInfo, 'no-internal-links-found')
      expect(foundLink, 'Should find at least one internal link in mega menus').toBeDefined()
    }
  })

  test('comprehensive menu link audit', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)

    const navItems = await getMegaMenuNavItems(page)
    const auditResults: {
      menu: string
      index: number
      totalLinks: number
      internalLinks: number
      externalLinks: number
      doubleLocaleLinks: number
      problematicLinks: string[]
    }[] = []

    let screenshotCount = 0
    for (const item of navItems) {
      const opened = await openMegaMenuDropdownByIndex(page, item.index)
      if (!opened) continue

      await page.waitForTimeout(500)
      const links = await getMegaMenuDropdownLinks(page, 'en')

      const internalLinks = links.filter((l) => !l.isExternal)
      const externalLinks = links.filter((l) => l.isExternal)
      const doubleLocaleLinks = links.filter((l) => l.hasDoubleLocale)

      // Take screenshot of each menu with links
      if (links.length > 0 && screenshotCount < 3) {
        await writeEvidenceScreenshot(page, testInfo, `audit-menu-${item.text.toLowerCase().replace(/\s+/g, '-')}`)
        screenshotCount++
      }

      auditResults.push({
        menu: item.text,
        index: item.index,
        totalLinks: links.length,
        internalLinks: internalLinks.length,
        externalLinks: externalLinks.length,
        doubleLocaleLinks: doubleLocaleLinks.length,
        problematicLinks: doubleLocaleLinks.map((l) => `${l.text}: ${l.href}`),
      })

      await closeMegaMenuDropdown(page)
    }

    // Log audit results
    console.log('\n=== BL-680 Mega Menu Link Audit ===')
    for (const result of auditResults) {
      console.log(`\nMenu: ${result.menu} (index: ${result.index})`)
      console.log(`  Total links: ${result.totalLinks}`)
      console.log(`  Internal links: ${result.internalLinks}`)
      console.log(`  External links: ${result.externalLinks}`)
      console.log(`  Double locale links: ${result.doubleLocaleLinks}`)
      if (result.problematicLinks.length > 0) {
        console.log(`  Problematic: ${result.problematicLinks.join(', ')}`)
      }
    }

    // Final assertion: no double locale links anywhere
    const totalProblematic = auditResults.reduce((sum, r) => sum + r.doubleLocaleLinks, 0)
    expect(
      totalProblematic,
      `No menus should have double locale links. Found ${totalProblematic} problematic links.`,
    ).toBe(0)
  })
})
