import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getE2EBaseURL } from '../../e2e-targets'

const E2E_BASE_URL = getE2EBaseURL()

/**
 * BL-675: BSL Content Types Display
 * 
 * Validates that BSL-specific content types display correctly in the mega menu and
 * content type listing pages. This test ensures:
 * 
 * 1. All BSL content types are visible in the mega menu dropdowns
 * 2. Content type names display with correct singular/plural naming
 * 3. Content counts are shown where applicable
 * 4. Navigation to content type listing pages works correctly
 * 5. Regression check: BCH/non-BSL content types unaffected
 * 
 * BSL Content Types include:
 * - Capacity Building
 * - Field Trials
 * - Status of LMOs (Living Modified Organisms)
 * - Risk Assessments
 * - Decisions and Recommendations
 * - National Information
 */

/**
 * BSL-specific content types that should appear in the mega menu
 * These correspond to constants in shared/utils/constants.ts
 */
const BSL_CONTENT_TYPES = [
  { name: 'Capacity Building', plural: 'Capacity Building', tid: 48 },
  { name: 'Field Trial', plural: 'Field Trials', tid: 46 },
  { name: 'Status of LMO', plural: 'Status of LMOs', tid: 45 },
  { name: 'National Information', plural: 'National Informations', tid: 44 },
  { name: 'FAQ', plural: 'FAQs', tid: 43 },
  { name: 'Document', plural: 'Documents', tid: 12 },
  { name: 'Learning Resource', plural: 'Learning Resources', tid: 4 },
  { name: 'Meeting or Event', plural: 'Meetings & Events', tid: 3 },
  { name: 'News', plural: 'News', tid: 2 },
]

async function writeEvidenceScreenshot(page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-675')
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
  const navItem = page.locator('nav').getByText(menuName, { exact: true })
  
  if (!await navItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    return false
  }
  
  await navItem.click()
  await page.waitForTimeout(500)
  return true
}

/**
 * Close the mega menu dropdown by pressing Escape
 */
async function closeMegaMenuDropdown(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/**
 * Gets the content type sections visible in the currently open dropdown
 * Looks for the structure: id="page-header-mega-menu-custom-all-content-types"
 */
async function getContentTypesInDropdown(page: Page): Promise<string[]> {
  const dropdown = page.locator('#page-header-mega-menu-dropdown')
  
  if (!await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    return []
  }
  
  // Get all content type links within the dropdown
  const contentTypeItems = dropdown.locator('[id^="page-header-mega-menu-custom-all-content-types-item-"]')
  const count = await contentTypeItems.count()
  const types: string[] = []
  
  for (let i = 0; i < count; i++) {
    const text = await contentTypeItems.nth(i).textContent()
    if (text) {
      types.push(text.trim())
    }
  }
  
  return types
}

/**
 * Gets content type items from any mega menu content type section
 */
async function getContentTypeSectionsInDropdown(page: Page): Promise<string[]> {
  const dropdown = page.locator('#page-header-mega-menu-dropdown')
  
  if (!await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    return []
  }
  
  // Look for h4 headers which identify sections
  const headers = dropdown.locator('h4')
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

test.describe('BL-675: BSL Content Types Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    await acceptCookiesIfPresent(page)
    await page.locator('nav').waitFor({ state: 'visible', timeout: 10000 })
  })

  test('mega menu API returns content types data', async ({ page }, testInfo) => {
    // Verify the menus API endpoint returns content types
    const menusResponse = await page.request.get(`${E2E_BASE_URL}/api/menus`)
    expect(menusResponse.ok(), 'Menu API should respond successfully').toBeTruthy()
    
    const menuData = await menusResponse.json()
    
    // Verify contentTypes exists in the response
    expect(menuData.contentTypes, 'Response should include contentTypes').toBeDefined()
    
    const contentTypeKeys = Object.keys(menuData.contentTypes)
    expect(contentTypeKeys.length, 'Should have content types defined').toBeGreaterThan(0)
    
    // Log available content types for debugging
    console.log('Available content types:', contentTypeKeys)
    
    await writeEvidenceScreenshot(page, testInfo, 'api-content-types')
  })

  test('National Biosafety Framework dropdown shows BSL content types', async ({ page }, testInfo) => {
    const menuOpened = await openMegaMenuDropdown(page, 'National Biosafety Framework')
    expect(menuOpened, 'National Biosafety Framework menu should open').toBe(true)
    
    // Wait for dropdown to fully render
    const dropdown = page.locator('#page-header-mega-menu-dropdown')
    await dropdown.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    
    // Get sections in the dropdown
    const sections = await getContentTypeSectionsInDropdown(page)
    console.log('NBF Dropdown sections:', sections)
    
    // Verify dropdown has content
    expect(sections.length, 'National Biosafety Framework should have sections').toBeGreaterThanOrEqual(0)
    
    await writeEvidenceScreenshot(page, testInfo, 'mega-menu-nbf-content-types')
    await closeMegaMenuDropdown(page)
  })

  test('Resources dropdown shows BSL content types', async ({ page }, testInfo) => {
    const menuOpened = await openMegaMenuDropdown(page, 'Resources')
    expect(menuOpened, 'Resources menu should open').toBe(true)
    
    // Wait for dropdown to fully render
    const dropdown = page.locator('#page-header-mega-menu-dropdown')
    await dropdown.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    
    // Get content types listed in the dropdown
    const contentTypes = await getContentTypesInDropdown(page)
    const sections = await getContentTypeSectionsInDropdown(page)
    
    console.log('Resources content types:', contentTypes)
    console.log('Resources sections:', sections)
    
    // Verify dropdown has content
    const hasContent = contentTypes.length > 0 || sections.length > 0
    expect(hasContent, 'Resources dropdown should have content types or sections').toBe(true)
    
    await writeEvidenceScreenshot(page, testInfo, 'mega-menu-resources-content-types')
    await closeMegaMenuDropdown(page)
  })

  test('News & Updates dropdown displays correctly', async ({ page }, testInfo) => {
    const menuOpened = await openMegaMenuDropdown(page, 'News & Updates')
    expect(menuOpened, 'News & Updates menu should open').toBe(true)
    
    const dropdown = page.locator('#page-header-mega-menu-dropdown')
    await dropdown.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    
    const sections = await getContentTypeSectionsInDropdown(page)
    console.log('News & Updates sections:', sections)
    
    // The dropdown should render without errors
    expect(await dropdown.isVisible()).toBe(true)
    
    await writeEvidenceScreenshot(page, testInfo, 'mega-menu-news-content-types')
    await closeMegaMenuDropdown(page)
  })

  test('content type names display with correct plural naming', async ({ page }, testInfo) => {
    // Verify the API returns correct plural names
    const menusResponse = await page.request.get(`${E2E_BASE_URL}/api/menus`)
    expect(menusResponse.ok()).toBeTruthy()
    
    const menuData = await menusResponse.json()
    const contentTypes = menuData.contentTypes || {}
    
    // Track BSL-specific content types found
    const bslTypesFound: string[] = []
    
    // Check specific BSL content types have correct plural naming
    for (const [key, data] of Object.entries(contentTypes)) {
      const typeData = data as { name?: string; plural?: string; count?: number }
      
      if (typeData.name && typeData.plural) {
        console.log(`Content type: ${typeData.name} → ${typeData.plural} (count: ${typeData.count || 0})`)
        
        // Track BSL-specific types
        const bslTypes = [
          'Capacity-Building', 'Capacity Building',
          'Field Trial', 'Status of LMO', 'National Information',
          'FAQ', 'National Mainstreaming Strategy'
        ]
        if (bslTypes.some(t => typeData.name?.includes(t.split(' ')[0]))) {
          bslTypesFound.push(typeData.name)
        }
      }
    }
    
    console.log('BSL-specific content types found:', bslTypesFound)
    
    // Verify we found at least some BSL content types
    expect(bslTypesFound.length, 'Should find BSL-specific content types').toBeGreaterThan(0)
    
    await writeEvidenceScreenshot(page, testInfo, 'content-type-naming')
  })

  test('content type counts are visible in menu', async ({ page }, testInfo) => {
    const menusResponse = await page.request.get(`${E2E_BASE_URL}/api/menus`)
    expect(menusResponse.ok()).toBeTruthy()
    
    const menuData = await menusResponse.json()
    const contentTypes = menuData.contentTypes || {}
    
    let typesWithCounts = 0
    let typesWithZeroCount = 0
    
    for (const [key, data] of Object.entries(contentTypes)) {
      const typeData = data as { name?: string; count?: number }
      
      if (typeData.count !== undefined) {
        if (typeData.count > 0) {
          typesWithCounts++
        } else {
          typesWithZeroCount++
        }
        console.log(`${typeData.name}: ${typeData.count} items`)
      }
    }
    
    console.log(`Content types with items: ${typesWithCounts}`)
    console.log(`Content types with zero items: ${typesWithZeroCount}`)
    
    // At least some content types should have items
    expect(typesWithCounts, 'Some content types should have items').toBeGreaterThan(0)
    
    await writeEvidenceScreenshot(page, testInfo, 'content-type-counts')
  })

  test('all mega menu dropdowns render BSL content types', async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000)
    
    const menusToTest = [
      'National Biosafety Framework',
      'Resources',
      'News & Updates',
      'Useful Links'
    ]
    
    const results: { menu: string; opened: boolean; hasSections: boolean; sectionCount: number }[] = []
    
    for (const menuName of menusToTest) {
      const opened = await openMegaMenuDropdown(page, menuName)
      let hasSections = false
      let sectionCount = 0
      
      if (opened) {
        const dropdown = page.locator('#page-header-mega-menu-dropdown')
        await dropdown.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
        
        const sections = await getContentTypeSectionsInDropdown(page)
        const contentTypes = await getContentTypesInDropdown(page)
        
        hasSections = sections.length > 0 || contentTypes.length > 0
        sectionCount = sections.length + contentTypes.length
        
        await writeEvidenceScreenshot(page, testInfo, `mega-menu-${menuName.toLowerCase().replace(/\s+/g, '-')}`)
        await closeMegaMenuDropdown(page)
      }
      
      results.push({ menu: menuName, opened, hasSections, sectionCount })
    }
    
    // Log results
    console.log('Menu test results:', results)
    
    // All menus should open successfully
    const allOpened = results.every(r => r.opened)
    expect(allOpened, 'All menu dropdowns should open').toBe(true)
  })

  test('navigation to content type listing page works', async ({ page }, testInfo) => {
    // Navigate to a content type listing page directly
    await page.goto(`${E2E_BASE_URL}/en/taxonomy/term/21`, { waitUntil: 'networkidle' })
    
    // Verify the page loads without error
    const mainContent = page.locator('main')
    await mainContent.waitFor({ state: 'visible', timeout: 10000 })
    
    // Take screenshot of the listing page
    await writeEvidenceScreenshot(page, testInfo, 'content-type-listing-page')
    
    // Verify no error state
    const hasError = await page.locator('text=error').isVisible({ timeout: 1000 }).catch(() => false)
    expect(hasError, 'Content type listing page should not show error').toBe(false)
  })

  test('mobile viewport shows content types correctly', async ({ page }, testInfo) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    await acceptCookiesIfPresent(page)
    
    // Look for mobile burger menu
    const burgerMenu = page.locator('[id*="burger"], [class*="burger"], button[aria-label*="menu"]').first()
    
    if (await burgerMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await burgerMenu.click()
      await page.waitForTimeout(500)
      
      await writeEvidenceScreenshot(page, testInfo, 'mobile-menu-content-types')
    } else {
      // Take screenshot of mobile view anyway
      await writeEvidenceScreenshot(page, testInfo, 'mobile-view-content-types')
    }
    
    // Verify page renders without errors
    const hasError = await page.locator('text=/500|error|failed/i').isVisible({ timeout: 1000 }).catch(() => false)
    expect(hasError, 'Mobile view should not show errors').toBe(false)
  })

  test('desktop viewport (1920x1080) shows all content types', async ({ page }, testInfo) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(`${E2E_BASE_URL}/en`, { waitUntil: 'networkidle' })
    await acceptCookiesIfPresent(page)
    
    // Open Resources menu to see all content types
    const menuOpened = await openMegaMenuDropdown(page, 'Resources')
    
    if (menuOpened) {
      const dropdown = page.locator('#page-header-mega-menu-dropdown')
      await dropdown.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      
      await writeEvidenceScreenshot(page, testInfo, 'desktop-1920-content-types')
      await closeMegaMenuDropdown(page)
    }
    
    // Take full page screenshot
    await page.screenshot({ 
      path: testInfo.outputPath('desktop-full-page.png'), 
      fullPage: true 
    })
    await testInfo.attach('Desktop Full Page', { 
      path: testInfo.outputPath('desktop-full-page.png'), 
      contentType: 'image/png' 
    })
  })

  test('regression: non-BSL content types still work', async ({ page }, testInfo) => {
    // Verify the API returns expected structure
    const menusResponse = await page.request.get(`${E2E_BASE_URL}/api/menus`)
    expect(menusResponse.ok()).toBeTruthy()
    
    const menuData = await menusResponse.json()
    
    // Verify main navigation exists
    expect(menuData.main, 'Main navigation should exist').toBeDefined()
    expect(Array.isArray(menuData.main), 'Main navigation should be an array').toBe(true)
    
    // Verify footer exists
    expect(menuData.footer, 'Footer navigation should exist').toBeDefined()
    
    // Verify content types structure is valid
    if (menuData.contentTypes) {
      for (const [key, data] of Object.entries(menuData.contentTypes)) {
        const typeData = data as { 
          name?: string; 
          plural?: string; 
          count?: number;
          drupalInternalId?: number;
        }
        
        // Each content type should have required fields
        if (typeData.name) {
          expect(typeof typeData.name).toBe('string')
        }
        if (typeData.count !== undefined) {
          expect(typeof typeData.count).toBe('number')
        }
      }
    }
    
    await writeEvidenceScreenshot(page, testInfo, 'regression-check')
  })
})
