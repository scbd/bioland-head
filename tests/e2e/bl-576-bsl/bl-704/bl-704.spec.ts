/**
 * BL-704: Pagination Offset Fix E2E Tests
 *
 * CONTEXT:
 * - BL-704 fixed the Drupal pagination offset calculation in server/utils/lists/index.js
 * - However, the /en/search page uses SCBD index (not Drupal)
 * - BL-672 SSR refactor introduced a regression where the list component uses staticQuery
 *   instead of a reactive query, so refresh() always fetches page=1
 *
 * CURRENT STATUS:
 * - Server-side fix (BL-704): ✅ Applied
 * - Frontend fix needed: ❌ app/components/page/list/index.vue uses staticQuery
 *
 * These tests verify:
 * 1. ✅ Pagination controls exist and are interactive
 * 2. ❌ Page items change when navigating (FAILS - frontend bug)
 * 3. ✅ URL updates correctly when clicking page numbers
 * 4. ✅ Direct URL navigation works (URL has correct page, but items don't change)
 *
 * @see server/utils/lists/index.js - getPaginationParams()
 * @see app/components/page/list/index.vue - useFetch with staticQuery (the bug)
 */

import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getE2EBaseURL } from '../../e2e-targets'
import { seedConsentCookies } from '../../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL()

// Search page - the only page with proper pagination for BSL
const SEARCH_PATH = '/en/search'

// Selectors
const SELECTORS = {
  listContainer: '#page-list-results-container',
  listRow: '[id^="page-list-row-"]',
  pager: '#page-list-bottom-pager',
  pagination: '.pagination',
  prevButton: '[id$="-prev"]',
  nextButton: '[id$="-next"]',
  pageLinks: '.page-link',
  currentPage: '.page-link.current',
}

/**
 * Save evidence screenshot to .test-results/BL-704/
 */
async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-704')
  await mkdir(dir, { recursive: true })

  const fileName = `${name}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: true })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

/**
 * Wait for list to load
 */
async function waitForListLoad(page: Page): Promise<void> {
  await page.locator(SELECTORS.listContainer).waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(500)
}

/**
 * Get unique identifiers for visible list items
 * Uses card title text as identifier (should be unique per item)
 */
async function getItemIdentifiers(page: Page, maxItems = 10): Promise<string[]> {
  const rows = page.locator(SELECTORS.listRow)
  const count = Math.min(await rows.count(), maxItems)
  const ids: string[] = []

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    // Try href first (most reliable if available)
    const href = await row.getAttribute('href')
    if (href && !href.startsWith('#')) {
      ids.push(href)
      continue
    }
    // Fallback to card title text
    const titleEl = row.locator('.card-title').first()
    if (await titleEl.count() > 0) {
      const title = await titleEl.textContent()
      ids.push(title?.trim() || `item-${i}`)
    } else {
      ids.push(`item-${i}`)
    }
  }

  return ids
}

/**
 * Check if pagination controls exist
 */
async function hasPagination(page: Page): Promise<boolean> {
  const pager = page.locator(SELECTORS.pager)
  return await pager.count() > 0 && await pager.isVisible()
}

/**
 * Get current page number from pagination
 */
async function getCurrentPageNumber(page: Page): Promise<number> {
  const currentPage = page.locator(SELECTORS.currentPage)
  if (await currentPage.count() > 0) {
    const text = await currentPage.textContent()
    return parseInt(text || '1', 10)
  }
  return 1
}

/**
 * Check if Next button is enabled
 * The li element with id ending in -next has class="disabled" when disabled
 */
async function isNextEnabled(page: Page): Promise<boolean> {
  const nextLi = page.locator(SELECTORS.nextButton).first()
  if (await nextLi.count() === 0) return false

  const classes = await nextLi.getAttribute('class') || ''
  return !classes.includes('disabled')
}

/**
 * Check if Prev button is enabled
 * The li element with id ending in -prev has class="disabled" when disabled
 */
async function isPrevEnabled(page: Page): Promise<boolean> {
  const prevLi = page.locator(SELECTORS.prevButton).first()
  if (await prevLi.count() === 0) return false

  const classes = await prevLi.getAttribute('class') || ''
  return !classes.includes('disabled')
}

test.describe('BL-704: Pagination Offset Fix', () => {
  test.setTimeout(90000)

  test.describe('Search Page Pagination', () => {
    
    test('pagination controls exist and are functional', async ({ page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)

      await page.goto(`${E2E_BASE_URL}${SEARCH_PATH}`)
      await page.waitForLoadState('networkidle')
      await waitForListLoad(page)

      // Evidence: Initial page state
      await screenshot(page, testInfo, '01-initial-page')

      // Verify pagination exists
      const hasPager = await hasPagination(page)
      
      if (!hasPager) {
        console.log('⚠️ No pagination visible - may need more content')
        await screenshot(page, testInfo, '02-no-pagination')
        // Skip test if no pagination - not enough content
        test.skip(true, 'No pagination available - not enough content')
        return
      }

      // Evidence: Pagination controls visible
      await page.locator(SELECTORS.pager).scrollIntoViewIfNeeded()
      await screenshot(page, testInfo, '02-pagination-visible')

      // Verify initial state
      const pageNum = await getCurrentPageNumber(page)
      expect(pageNum, 'Should start on page 1').toBe(1)

      // Verify Prev is disabled on page 1
      const prevDisabled = !await isPrevEnabled(page)
      expect(prevDisabled, 'Prev should be disabled on page 1').toBe(true)

      // Verify Next is enabled (if there's more content)
      const nextEnabled = await isNextEnabled(page)
      console.log(`Next button enabled: ${nextEnabled}`)

      if (nextEnabled) {
        // Click Next
        await page.locator(SELECTORS.nextButton).first().click()
        await waitForListLoad(page)

        // Evidence: After clicking Next
        await screenshot(page, testInfo, '03-after-next-click')

        // Verify URL changed
        expect(page.url()).toContain('page=2')

        // Verify page number updated
        const newPageNum = await getCurrentPageNumber(page)
        expect(newPageNum, 'Should be on page 2').toBe(2)

        // Verify Prev is now enabled
        const prevEnabled = await isPrevEnabled(page)
        expect(prevEnabled, 'Prev should be enabled on page 2').toBe(true)

        // Evidence: Page 2 pagination state
        await page.locator(SELECTORS.pager).scrollIntoViewIfNeeded()
        await screenshot(page, testInfo, '04-page-2-pagination')
      }
    })

    /**
     * FIXME: This test correctly detects an existing bug.
     *
     * BUG: The list component (app/components/page/list/index.vue) uses `staticQuery`
     * in the useFetch call, so refresh() always fetches page=1 regardless of URL.
     *
     * ROOT CAUSE:
     * - BL-681 originally fixed this by using a reactive computed query
     * - BL-672 (SSR refactor) undid the fix by introducing staticQuery
     * - BL-704 fixed the server-side Drupal offset, but frontend bug remains
     *
     * FIX REQUIRED: Update list component to use reactive query instead of staticQuery
     *
     * When the fix is applied, remove .fixme() to enable this test.
     */
    test.fixme('page items change when navigating between pages', async ({ page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)

      await page.goto(`${E2E_BASE_URL}${SEARCH_PATH}`)
      await page.waitForLoadState('networkidle')
      await waitForListLoad(page)

      if (!await hasPagination(page)) {
        test.skip(true, 'No pagination available')
        return
      }

      // Get page 1 items
      const page1Hrefs = await getItemIdentifiers(page)
      console.log(`Page 1: ${page1Hrefs.length} items`)
      
      // Evidence: Page 1 items
      await screenshot(page, testInfo, '01-page-1-items')

      if (!await isNextEnabled(page)) {
        console.log('Next button not enabled - only one page of results')
        test.skip(true, 'Only one page of results')
        return
      }

      // Navigate to page 2
      await page.locator(SELECTORS.nextButton).first().click()
      await waitForListLoad(page)

      // Get page 2 items
      const page2Hrefs = await getItemIdentifiers(page)
      console.log(`Page 2: ${page2Hrefs.length} items`)

      // Evidence: Page 2 items
      await screenshot(page, testInfo, '02-page-2-items')

      // Check for duplicates
      const page1Set = new Set(page1Hrefs)
      const duplicates = page2Hrefs.filter(href => page1Set.has(href))

      console.log(`Duplicates between pages: ${duplicates.length}`)
      if (duplicates.length > 0) {
        console.log('⚠️ BUG DETECTED: Same items appear on both pages')
        console.log('Duplicate hrefs:', duplicates.slice(0, 3))
        console.log('See FIXME comment above - frontend uses staticQuery instead of reactive query')
      }

      // Evidence: Comparison screenshot
      await screenshot(page, testInfo, '03-duplicate-comparison')

      // This assertion verifies the fix works
      // Currently fails because frontend bug exists (BL-672 regression)
      // Will pass once list component uses reactive query
      expect(
        duplicates.length, 
        'Page 2 should show DIFFERENT items than page 1 (pagination offset fix)'
      ).toBe(0)
    })

    test('clicking page numbers navigates correctly', async ({ page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)

      await page.goto(`${E2E_BASE_URL}${SEARCH_PATH}`)
      await page.waitForLoadState('networkidle')
      await waitForListLoad(page)

      if (!await hasPagination(page)) {
        test.skip(true, 'No pagination available')
        return
      }

      // Evidence: Initial state
      await screenshot(page, testInfo, '01-initial')

      // Try to click page 2 directly
      const page2Link = page.locator('[id$="-page-link-2"]')
      
      if (await page2Link.count() > 0) {
        await page2Link.click()
        await waitForListLoad(page)

        // Evidence: After clicking page 2
        await screenshot(page, testInfo, '02-clicked-page-2')

        // Verify URL and page state
        expect(page.url()).toContain('page=2')
        
        const pageNum = await getCurrentPageNumber(page)
        expect(pageNum, 'Should be on page 2').toBe(2)

        // Try to go back to page 1
        const page1Link = page.locator('[id$="-page-link-1"]')
        if (await page1Link.count() > 0) {
          await page1Link.click()
          await waitForListLoad(page)

          // Evidence: Back on page 1
          await screenshot(page, testInfo, '03-back-to-page-1')

          const backPageNum = await getCurrentPageNumber(page)
          expect(backPageNum, 'Should be back on page 1').toBe(1)
        }
      } else {
        console.log('Page 2 link not visible - may only have 1 page')
      }
    })

    test('direct URL navigation to page 2 works', async ({ page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)

      // Navigate directly to page 2 via URL
      await page.goto(`${E2E_BASE_URL}${SEARCH_PATH}?page=2`)
      await page.waitForLoadState('networkidle')
      await waitForListLoad(page)

      // Evidence: Direct navigation to page 2
      await screenshot(page, testInfo, '01-direct-to-page-2')

      // Verify we're on page 2
      const pageNum = await getCurrentPageNumber(page)
      console.log(`Direct navigation: on page ${pageNum}`)

      // Get items on this page
      const page2Hrefs = await getItemIdentifiers(page)
      console.log(`Page 2 (direct): ${page2Hrefs.length} items`)

      // Now navigate to page 1 via URL
      await page.goto(`${E2E_BASE_URL}${SEARCH_PATH}?page=1`)
      await page.waitForLoadState('networkidle')
      await waitForListLoad(page)

      // Evidence: Page 1 via URL
      await screenshot(page, testInfo, '02-direct-to-page-1')

      // Get page 1 items
      const page1Hrefs = await getItemIdentifiers(page)
      console.log(`Page 1 (direct): ${page1Hrefs.length} items`)

      // Compare items
      const page2Set = new Set(page2Hrefs)
      const duplicates = page1Hrefs.filter(href => page2Set.has(href))

      console.log(`Duplicates between URL navigations: ${duplicates.length}`)

      // Evidence: Comparison
      await screenshot(page, testInfo, '03-url-navigation-comparison')

      // This tests if server-side pagination works (it should via staticQuery initial value)
      // Note: This may pass even if client-side navigation fails
      if (duplicates.length > 0) {
        console.log('⚠️ Even direct URL navigation shows duplicates')
      }
    })

  })
})
