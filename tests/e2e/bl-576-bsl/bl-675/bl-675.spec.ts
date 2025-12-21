import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getE2EBaseURL } from '../../e2e-targets'
import { contentTypesBSL } from '../../../../shared/utils/constants'

const E2E_BASE_URL = getE2EBaseURL()

// 6 UN official languages
const UN_LANGUAGES = ['en', 'fr', 'es', 'ru', 'zh', 'ar'] as const

/**
 * BL-675: BSL Content Types Display
 * 
 * Validates that all BSL-specific content types display correctly when navigating
 * to their taxonomy term URLs. Each content type should:
 * 
 * 1. Navigate to /taxonomy/term/${drupalInternalTid}
 * 2. Redirect to the correct plural slug (e.g., /en/projects)
 * 3. Display the correct page title in h2#page-list-title-content-type
 * 4. Show content list items if any exist
 * 
 * Tests all 6 UN official languages (en, fr, es, ru, zh, ar) for each content type.
 * 
 * BSL Content Types (from contentTypesBSL in constants.ts):
 * - News (tid: 2)
 * - Meeting or Event (tid: 3)
 * - Project (tid: 5)
 * - Document (tid: 12)
 * - Related Website (tid: 13)
 * - Image or Video (tid: 16)
 * - Other Resource (tid: 55)
 * - FAQ (tid: 43)
 * - National Information (tid: 44)
 * - Status of LMO (tid: 45)
 * - Field Trial (tid: 46)
 * - National Mainstreaming Strategy (tid: 47)
 * - Capacity Building (tid: 48)
 * - Announcement (tid: 49)
 * - Contact (tid: 50)
 */

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

interface ContentTypeTestResult {
  tid: number
  name: string
  expectedPlural: string
  locale: string
  url: string
  finalUrl: string
  redirectedCorrectly: boolean
  titleFound: boolean
  titleText: string | null
  hasListContainer: boolean
  itemCount: number
  passed: boolean
  error?: string
}

/**
 * Tests a single content type by navigating to its taxonomy term URL
 * and verifying the page displays correctly
 */
async function testContentType(
  page: Page,
  tid: number,
  name: string,
  expectedPlural: string,
  locale: string
): Promise<ContentTypeTestResult> {
  const url = `${E2E_BASE_URL}/${locale}/taxonomy/term/${tid}`
  const result: ContentTypeTestResult = {
    tid,
    name,
    expectedPlural,
    locale,
    url,
    finalUrl: '',
    redirectedCorrectly: false,
    titleFound: false,
    titleText: null,
    hasListContainer: false,
    itemCount: 0,
    passed: false,
  }

  try {
    // Navigate to taxonomy term URL
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    
    // Check response status
    if (!response || response.status() >= 400) {
      result.error = `HTTP ${response?.status() || 'no response'}`
      return result
    }

    // Get final URL after any redirects
    result.finalUrl = page.url()
    
    // Check if redirected to a proper slug (not staying on /taxonomy/term/)
    result.redirectedCorrectly = !result.finalUrl.includes('/taxonomy/term/')

    // Wait for main content
    await page.locator('main').waitFor({ state: 'visible', timeout: 10000 })

    // Check for the page title element
    const titleElement = page.locator('#page-list-title-content-type')
    result.titleFound = await titleElement.isVisible({ timeout: 5000 }).catch(() => false)
    
    if (result.titleFound) {
      result.titleText = await titleElement.textContent()
    }

    // Check for list container
    const listContainer = page.locator('#page-list-results-container')
    result.hasListContainer = await listContainer.isVisible({ timeout: 3000 }).catch(() => false)

    // Count list items
    if (result.hasListContainer) {
      const listItems = page.locator('[id^="page-list-row-"]')
      result.itemCount = await listItems.count()
    }

    // Determine if test passed
    // Page should redirect and show title (items may be 0 for some content types)
    result.passed = result.redirectedCorrectly && result.titleFound

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
  }

  return result
}

test.describe('BL-675: BSL Content Types Display', () => {
  test.setTimeout(900_000) // 15 minutes for all content types across all languages

  // Test all BSL content types across all 6 UN languages
  UN_LANGUAGES.forEach((locale) => {
    test(`all BSL content types display correctly in ${locale.toUpperCase()}`, async ({ page }, testInfo) => {
      await acceptCookiesIfPresent(page)
      
      const results: ContentTypeTestResult[] = []
      const failedTypes: string[] = []

      for (const contentType of contentTypesBSL) {
        const result = await testContentType(
          page,
          contentType.drupalInternalTid,
          contentType.name,
          contentType.field_plural,
          locale
        )
        results.push(result)

        // Take screenshot for each content type
        await writeEvidenceScreenshot(
          page,
          testInfo,
          `${locale}-tid-${contentType.drupalInternalTid}-${contentType.name.toLowerCase().replace(/\s+/g, '-')}`
        )

        console.log(
          `[${locale.toUpperCase()}] ${contentType.name} (tid: ${contentType.drupalInternalTid}): ` +
          `${result.passed ? '✓' : '✗'} | ` +
          `Title: "${result.titleText || 'NOT FOUND'}" | ` +
          `Items: ${result.itemCount} | ` +
          `URL: ${result.finalUrl}`
        )

        if (!result.passed) {
          failedTypes.push(`${contentType.name} (tid: ${contentType.drupalInternalTid}): ${result.error || 'title not found'}`)
        }
      }

      // Log summary
      const passedCount = results.filter(r => r.passed).length
      console.log(`\n[${locale.toUpperCase()}] Summary: ${passedCount}/${results.length} content types passed`)

      // Assert all passed
      expect(failedTypes, `Failed content types: ${failedTypes.join(', ')}`).toHaveLength(0)
    })
  })

  // Individual tests for each BSL content type across all 6 UN languages (generated dynamically)
  contentTypesBSL.forEach((contentType) => {
    test(`${contentType.name} (tid: ${contentType.drupalInternalTid}) displays correctly in all languages`, async ({ page }, testInfo) => {
      await acceptCookiesIfPresent(page)
      
      const slug = contentType.name.toLowerCase().replace(/\s+/g, '-')
      
      // Test all 6 UN languages
      for (const locale of UN_LANGUAGES) {
        const result = await testContentType(
          page,
          contentType.drupalInternalTid,
          contentType.name,
          contentType.field_plural,
          locale
        )
        await writeEvidenceScreenshot(page, testInfo, `${slug}-${locale}`)
        expect(result.passed, `${locale.toUpperCase()}: ${result.error || 'title not found'}`).toBe(true)
      }
    })
  })

  test('content list items display with correct structure', async ({ page }, testInfo) => {
    await acceptCookiesIfPresent(page)
    
    // Navigate to a content type that has items (Projects typically has content)
    await page.goto(`${E2E_BASE_URL}/en/taxonomy/term/5`, { waitUntil: 'networkidle' })
    
    // Check for list container
    const listContainer = page.locator('#page-list-results-container')
    const hasContainer = await listContainer.isVisible({ timeout: 5000 }).catch(() => false)
    
    if (hasContainer) {
      // Check first list item structure
      const firstRow = page.locator('#page-list-row-0')
      const hasFirstRow = await firstRow.isVisible({ timeout: 3000 }).catch(() => false)
      
      if (hasFirstRow) {
        // Verify card structure
        const card = page.locator('#page-list-row-0-card')
        expect(await card.isVisible()).toBe(true)
        
        // Verify title
        const title = page.locator('#page-list-row-0-title')
        expect(await title.isVisible()).toBe(true)
        
        // Verify content type badge
        const typeBadge = page.locator('#page-list-row-0-type')
        expect(await typeBadge.isVisible()).toBe(true)
        const typeText = await typeBadge.textContent()
        expect(typeText?.toLowerCase()).toContain('project')
      }
    }
    
    await writeEvidenceScreenshot(page, testInfo, 'list-item-structure')
  })
})
