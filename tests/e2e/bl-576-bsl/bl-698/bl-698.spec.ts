import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getE2EBaseURL } from '../../e2e-targets'

const E2E_BASE_URL = getE2EBaseURL()

/**
 * BL-698: Mega Menu "View More" Counts - BSL Site Verification
 * 
 * On BSL (Biosafety) site, the content counts are below the threshold (> 5 items)
 * required to display "View More" links in the mega menu dropdowns. This test verifies:
 * 
 * 1. Mega menus render correctly without "View More" links in the DROPDOWNS
 * 2. Content type sections display within the dropdown
 * 3. The threshold logic works correctly: "View More" only appears when count > 5
 * 
 * IMPORTANT DISTINCTION:
 * - MEGA MENU DROPDOWNS: Appear when clicking nav items like "Resources", "News & Updates"
 *   These may contain "View More" links with class 'main-nav-final-link' when > 5 items
 * - HOMEPAGE CAROUSELS: Always visible on page with "View more resources" type links
 *   These are NOT what we're testing here
 * 
 * The mega menu "View More" format is typically:
 * - Has id like 'page-header-mega-menu-custom-content-type-final-link'
 * - Within the nav dropdown structure
 * - Only shows when returnData.length > 5 (see content-type/index.vue line 125)
 */

async function writeEvidenceScreenshot(page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-698')
  await mkdir(dir, { recursive: true })

  const fileName = `${basename}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: false })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

async function acceptCookiesIfPresent(page: Page): Promise<void> {
  const cookieBar = page.locator('.cookieControl__Bar')
  
  if (await cookieBar.isVisible({ timeout: 3000 }).catch(() => false)) {
    const acceptButton = page.getByRole('button', { name: /accept all/i })
    if (await acceptButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await acceptButton.click()
      await cookieBar.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    }
  }
}

/**
 * Opens a mega menu dropdown by clicking on its nav trigger
 */
async function openMegaMenuDropdown(page: Page, menuName: string): Promise<boolean> {
  // Find the nav item with the given text
  const navItem = page.locator('nav').getByText(menuName, { exact: true })
  
  if (!await navItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    return false
  }
  
  await navItem.click()
  await page.waitForTimeout(500) // Wait for dropdown animation
  return true
}

/**
 * Checks if a "View More" link exists in the currently open mega menu dropdown.
 * The mega menu View More links have specific patterns:
 * - ID: 'page-header-mega-menu-custom-content-type-final-link'
 * - Class: 'main-nav-final-link' or 'mm-main-nav-final-link'
 * - Located within the dropdown area (not homepage carousels)
 */
async function hasViewMoreInDropdown(page: Page): Promise<boolean> {
  // The dropdown is within the nav listitem structure
  // Look for View More by ID (most specific)
  const viewMoreById = page.locator('#page-header-mega-menu-custom-content-type-final-link')
  if (await viewMoreById.isVisible({ timeout: 1000 }).catch(() => false)) {
    return true
  }
  
  // Look for View More by class pattern within nav
  const viewMoreByClass = page.locator('nav').locator('.main-nav-final-link, .mm-main-nav-final-link')
  if (await viewMoreByClass.isVisible({ timeout: 500 }).catch(() => false)) {
    return true
  }
  
  return false
}

/**
 * Gets the content sections visible in the currently open dropdown
 */
async function getDropdownSections(page: Page): Promise<string[]> {
  // The dropdown contains h4 elements for section headers
  const headers = page.locator('nav').locator('h4')
  const count = await headers.count()
  const sections: string[] = []
  
  for (let i = 0; i < count; i++) {
    const text = await headers.nth(i).textContent()
    if (text) {
      sections.push(text.trim())
    }
  }
  
  return sections
}

/**
 * Close the mega menu dropdown by pressing Escape or clicking outside
 */
async function closeMegaMenuDropdown(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

test.describe('BL-698: Mega Menu View More Counts - BSL Site', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    await acceptCookiesIfPresent(page)
    // Wait for navigation to be ready
    await page.locator('nav').waitFor({ state: 'visible', timeout: 10000 })
  })

  test('National Biosafety Framework dropdown has no View More (content below threshold)', async ({ page }, testInfo) => {
    const menuOpened = await openMegaMenuDropdown(page, 'National Biosafety Framework')
    expect(menuOpened, 'Menu dropdown should open').toBe(true)
    
    // Check that no View More appears in the dropdown
    const hasViewMore = await hasViewMoreInDropdown(page)
    expect(hasViewMore, 'National Biosafety Framework dropdown should NOT have "View More" link').toBe(false)
    
    // Verify sections are present
    const sections = await getDropdownSections(page)
    expect(sections.length, 'Should have content sections in dropdown').toBeGreaterThan(0)
    
    await writeEvidenceScreenshot(page, testInfo, 'mega-menu-national-biosafety')
    await closeMegaMenuDropdown(page)
  })

  test('Resources dropdown has no View More (content below threshold)', async ({ page }, testInfo) => {
    const menuOpened = await openMegaMenuDropdown(page, 'Resources')
    expect(menuOpened, 'Resources menu dropdown should open').toBe(true)
    
    // Check that no View More appears in the dropdown
    const hasViewMore = await hasViewMoreInDropdown(page)
    expect(hasViewMore, 'Resources dropdown should NOT have "View More" link').toBe(false)
    
    // Verify some sections are present
    const sections = await getDropdownSections(page)
    expect(sections.length, 'Should have content sections in dropdown').toBeGreaterThan(0)
    
    await writeEvidenceScreenshot(page, testInfo, 'mega-menu-resources')
    await closeMegaMenuDropdown(page)
  })

  test('News & Updates dropdown has no View More (content below threshold)', async ({ page }, testInfo) => {
    const menuOpened = await openMegaMenuDropdown(page, 'News & Updates')
    expect(menuOpened, 'News & Updates menu dropdown should open').toBe(true)
    
    // Check that no View More appears in the dropdown
    const hasViewMore = await hasViewMoreInDropdown(page)
    expect(hasViewMore, 'News & Updates dropdown should NOT have "View More" link').toBe(false)
    
    // Verify some sections are present
    const sections = await getDropdownSections(page)
    expect(sections.length, 'Should have content sections in dropdown').toBeGreaterThan(0)
    
    await writeEvidenceScreenshot(page, testInfo, 'mega-menu-news-updates')
    await closeMegaMenuDropdown(page)
  })

  test('Useful Links dropdown has no View More (content below threshold)', async ({ page }, testInfo) => {
    const menuOpened = await openMegaMenuDropdown(page, 'Useful Links')
    expect(menuOpened, 'Useful Links menu dropdown should open').toBe(true)
    
    // Check that no View More appears in the dropdown
    const hasViewMore = await hasViewMoreInDropdown(page)
    expect(hasViewMore, 'Useful Links dropdown should NOT have "View More" link').toBe(false)
    
    await writeEvidenceScreenshot(page, testInfo, 'mega-menu-useful-links')
    await closeMegaMenuDropdown(page)
  })

  test('all mega menu dropdowns verified without View More', async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000)
    
    const menus = [
      'National Biosafety Framework',
      'Resources', 
      'News & Updates',
      'Useful Links'
    ]
    
    const results: { menu: string; hasViewMore: boolean; opened: boolean }[] = []
    
    for (const menu of menus) {
      const opened = await openMegaMenuDropdown(page, menu)
      let hasViewMore = false
      
      if (opened) {
        hasViewMore = await hasViewMoreInDropdown(page)
        await writeEvidenceScreenshot(page, testInfo, `mega-menu-${menu.toLowerCase().replace(/\s+/g, '-')}`)
        await closeMegaMenuDropdown(page)
      }
      
      results.push({ menu, hasViewMore, opened })
    }
    
    // Assert all menus opened and none had View More
    for (const result of results) {
      expect(result.opened, `${result.menu} dropdown should open`).toBe(true)
      expect(result.hasViewMore, `${result.menu} should NOT have "View More"`).toBe(false)
    }
  })

  test('homepage carousels have View More (expected behavior)', async ({ page }, testInfo) => {
    // This test verifies the homepage carousels DO have "View More" links
    // These are different from mega menu dropdowns
    
    // Homepage carousel "View More" links
    const carouselViewMoreLinks = page.locator('main').locator('a').filter({ 
      hasText: /View more/i 
    })
    
    const carouselCount = await carouselViewMoreLinks.count()
    
    // BSL homepage should have carousel View More links (for resources, news, etc.)
    expect(carouselCount, 'Homepage should have carousel View More links').toBeGreaterThan(0)
    
    await writeEvidenceScreenshot(page, testInfo, 'homepage-carousels-with-view-more')
  })
})
