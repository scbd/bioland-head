/**
 * BL-674: News Widget Link Fix E2E Tests
 * 
 * Tests that the news widget "View More" link navigates to the correct
 * search page (SEARCH) rather than the search section (SEARCH_SEC).
 * 
 * Bug Summary:
 * - News widget link was broken, pointing to the wrong page
 * - Link was using SEARCH_SEC instead of SEARCH constant
 * - Fix applied in app/components/swiper/content-type/index.vue
 * 
 * Verification:
 * - News widget link navigates to /search path (not /search-sec)
 * - URL includes correct schemas query parameter
 * - Other widget links still work correctly
 * 
 * Authentication:
 * - Uses anonymous context (public homepage)
 * - Cookie consent seeded to prevent banner interference
 */

import { test, expect } from '../../fixtures/auth'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { getE2EBaseURL } from '../../e2e-targets'
import { seedConsentCookies } from '../../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL()

// Test paths
const TEST_PATHS = {
  home: '/en',
  homeBsl: '/en',
}

// Selectors for content type swiper widget
const SELECTORS = {
  // Content type swiper widget container
  contentTypeSwiper: '.swiper-container, swiper-container',
  
  // View more link in the widget header area
  viewMoreLink: 'a.t.float-end, a.float-end.text-bold',
  
  // Alternative: any link containing "View more"
  viewMoreLinkByText: 'a:has-text("View more")',
  
  // Widget header (h3 with title)
  widgetHeader: 'h3',
  
  // Page body
  pageBody: '#page-body',
}

/**
 * Write screenshot evidence for Jira attachment
 */
async function writeEvidenceScreenshot(page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-674')
  await mkdir(dir, { recursive: true })

  const fileName = `${basename}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: true })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

test.describe('BL-674: News Widget Link Fix', () => {
  test.setTimeout(60000)

  test.describe('Bug Verification - News Widget Navigation', () => {
    
    test('news widget "View More" link uses correct system page ID (SEARCH not SEARCH_SEC)', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Navigate to homepage
      await page.goto(`${E2E_BASE_URL}${TEST_PATHS.home}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000) // Allow client-side hydration
      
      // Find View More links in the content type swiper widgets
      const viewMoreLinks = page.locator(SELECTORS.viewMoreLinkByText)
      const linkCount = await viewMoreLinks.count()
      
      console.log(`Found ${linkCount} "View More" links on homepage`)
      
      // Screenshot of homepage with widget visible
      await writeEvidenceScreenshot(page, testInfo, 'homepage-with-widget')
      
      // Verify at least one View More link exists
      expect(linkCount, 'Homepage should have at least one "View More" link').toBeGreaterThan(0)
      
      // Get the first View More link and verify its href
      const firstViewMoreLink = viewMoreLinks.first()
      const href = await firstViewMoreLink.getAttribute('href')
      
      console.log(`First "View More" link href: ${href}`)
      
      // Verify the href contains /search but NOT /search-sec
      // The fix changed from systemPageTidConstants.SEARCH_SEC to SEARCH
      expect(href, 'Link href should be defined').toBeTruthy()
      
      // BL-674 FIX VERIFICATION:
      // - SEARCH constant = 21 (correct)
      // - SEARCH_SEC constant = 23 (wrong - was the bug)
      // The href should contain taxonomy/term/21 (SEARCH) NOT taxonomy/term/23 (SEARCH_SEC)
      
      // Check the system page ID used in the URL
      const termIdMatch = href?.match(/taxonomy\/term\/(\d+)/)
      if (termIdMatch) {
        const termId = parseInt(termIdMatch[1], 10)
        console.log(`System Page Term ID: ${termId}`)
        
        // SEARCH = 21, SEARCH_SEC = 23
        expect(termId, 'Link should use SEARCH (21) not SEARCH_SEC (23)').toBe(21)
        console.log('✅ Correct system page ID (21 = SEARCH)')
      }
      
      // Also verify it doesn't contain search-sec in the resolved path
      if (href?.includes('search-sec')) {
        throw new Error(`BUG REGRESSION: Link points to search-sec (wrong page). href: ${href}`)
      }
      
      console.log('✅ Link does NOT point to search-sec (correct)')
      
      // Verify href contains schemas query parameter
      expect(href, 'Link href should contain schemas parameter').toContain('schemas')
      
      // Parse and log the schemas
      const hrefUrl = new URL(href!, E2E_BASE_URL)
      const schemas = hrefUrl.searchParams.getAll('schemas')
      console.log(`Schemas in href: ${schemas.join(', ')}`)
      
      expect(schemas.length, 'Link should have schemas for content filtering').toBeGreaterThan(0)
      
      // Screenshot showing the correct link
      await writeEvidenceScreenshot(page, testInfo, 'news-widget-correct-link')
      
      console.log('✅ News widget link correctly uses SEARCH system page with schemas filter')
    })
    
    test('news widget link href structure is correct before clicking', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Navigate to homepage
      await page.goto(`${E2E_BASE_URL}${TEST_PATHS.home}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      // Find all View More links
      const viewMoreLinks = page.locator(SELECTORS.viewMoreLinkByText)
      const linkCount = await viewMoreLinks.count()
      
      if (linkCount === 0) {
        console.log('No View More links found - widget may not be present on this page')
        test.skip()
        return
      }
      
      // Check each View More link's href attribute
      const linkDetails: { text: string, href: string | null }[] = []
      
      for (let i = 0; i < Math.min(linkCount, 5); i++) {
        const link = viewMoreLinks.nth(i)
        const text = await link.textContent()
        const href = await link.getAttribute('href')
        
        linkDetails.push({ text: text?.trim() || '', href })
        
        console.log(`Link ${i + 1}: "${text?.trim()}" -> ${href}`)
        
        // Verify this link does not point to search-sec
        if (href) {
          expect(href, `Link "${text}" should not point to search-sec`).not.toContain('search-sec')
        }
      }
      
      // Log all link details for evidence
      console.log('\nLink Analysis Summary:')
      linkDetails.forEach((detail, i) => {
        const status = detail.href?.includes('search-sec') ? '❌ BROKEN' : '✅ OK'
        console.log(`  ${i + 1}. ${status} "${detail.text}" -> ${detail.href}`)
      })
      
      await writeEvidenceScreenshot(page, testInfo, 'view-more-links-analysis')
    })
  })

  test.describe('Regression Prevention - Other Widget Links', () => {
    
    test('other content type widgets maintain correct link behavior', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Navigate to homepage
      await page.goto(`${E2E_BASE_URL}${TEST_PATHS.home}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      // Find all links in the page that might be content type swiper links
      const allLinks = page.locator('a[href*="schemas"]')
      const schemaLinksCount = await allLinks.count()
      
      console.log(`Found ${schemaLinksCount} links with schemas parameter`)
      
      // Verify each schema link structure
      for (let i = 0; i < Math.min(schemaLinksCount, 10); i++) {
        const link = allLinks.nth(i)
        const href = await link.getAttribute('href')
        
        if (href) {
          // Schema links from content-type widgets should use SEARCH, not SEARCH_SEC
          // Unless they're specifically for NT7 (National Targets 7) which uses SEARCH_SEC
          const isNT7Link = href.includes('nationalTarget7')
          
          if (!isNT7Link && href.includes('schemas')) {
            expect(href, `Schema link should not use search-sec: ${href}`).not.toMatch(/search-sec(?!\w)/)
          }
          
          console.log(`  Link ${i + 1}: ${href.substring(0, 100)}...`)
        }
      }
      
      await writeEvidenceScreenshot(page, testInfo, 'all-schema-links')
      
      console.log('✅ All content type widget links verified')
    })
    
    test('search page loads when clicking View More link', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Navigate to homepage and click a news widget link
      await page.goto(`${E2E_BASE_URL}${TEST_PATHS.home}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      // Find View More link
      const viewMoreLink = page.locator(SELECTORS.viewMoreLinkByText).first()
      
      if (await viewMoreLink.count() === 0) {
        console.log('No View More link found - skipping search page test')
        test.skip()
        return
      }
      
      // Get href before clicking
      const href = await viewMoreLink.getAttribute('href')
      console.log(`Clicking link: ${href}`)
      
      // Screenshot BEFORE navigation - showing the link on homepage
      await viewMoreLink.scrollIntoViewIfNeeded()
      await writeEvidenceScreenshot(page, testInfo, 'before-navigation-homepage')
      
      // Verify href structure before clicking
      expect(href, 'Link should have schemas parameter').toContain('schemas')
      
      // Verify correct system page ID (21 = SEARCH, not 23 = SEARCH_SEC)
      expect(href, 'Link should use term/21 (SEARCH)').toContain('taxonomy/term/21')
      
      // Click and navigate
      await viewMoreLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000) // Allow for any redirects
      
      // Verify we're on a search page (may redirect from taxonomy/term/21 to /search alias)
      const currentUrl = page.url()
      console.log(`Current URL after navigation: ${currentUrl}`)
      
      // The page should have loaded successfully
      // Even if there's a redirect, it should be to a search page, not search-sec
      expect(currentUrl, 'URL should not contain search-sec').not.toContain('search-sec')
      
      // Verify the final URL contains search (aliased from taxonomy/term/21)
      expect(currentUrl, 'URL should resolve to search page').toContain('/search')
      
      // Verify schemas are preserved in the URL after navigation
      const finalUrl = new URL(currentUrl)
      const schemasParam = finalUrl.searchParams.getAll('schemas')
      console.log(`Schemas in final URL: ${schemasParam.join(', ')}`)
      expect(schemasParam.length, 'Schemas should be preserved after navigation').toBeGreaterThan(0)
      
      // Wait for page content to load
      await page.waitForSelector('body', { timeout: 5000 })
      
      // Screenshot AFTER navigation - showing the search page with results
      await writeEvidenceScreenshot(page, testInfo, 'after-navigation-search-page')
      
      console.log('✅ Search page loaded successfully')
      console.log(`   Final URL: ${currentUrl}`)
      console.log(`   Schemas preserved: ${schemasParam.join(', ')}`)
    })
  })

  test.describe('URL Structure Verification', () => {
    
    test('verify correct system page ID in generated links', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      await page.goto(`${E2E_BASE_URL}${TEST_PATHS.home}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      // Find all View More links
      const viewMoreLinks = page.locator(SELECTORS.viewMoreLinkByText)
      const count = await viewMoreLinks.count()
      
      console.log('URL Structure Analysis:')
      console.log('========================')
      
      const urlAnalysis: {
        linkText: string
        href: string
        hasSchemas: boolean
        isSearchPage: boolean
        isSearchSecPage: boolean
        verdict: string
      }[] = []
      
      for (let i = 0; i < count; i++) {
        const link = viewMoreLinks.nth(i)
        const text = await link.textContent()
        const href = await link.getAttribute('href')
        
        if (!href) continue
        
        const analysis = {
          linkText: text?.trim() || '',
          href,
          hasSchemas: href.includes('schemas'),
          isSearchPage: href.includes('search') && !href.includes('search-sec'),
          isSearchSecPage: href.includes('search-sec'),
          verdict: ''
        }
        
        // Determine verdict
        if (analysis.isSearchSecPage && !href.includes('nationalTarget7')) {
          analysis.verdict = '❌ FAIL - Uses search-sec incorrectly'
        } else if (analysis.hasSchemas) {
          analysis.verdict = '✅ PASS - Correct URL structure'
        } else {
          analysis.verdict = '⚠️ CHECK - No schemas param'
        }
        
        urlAnalysis.push(analysis)
        
        console.log(`\nLink: "${analysis.linkText}"`)
        console.log(`  href: ${analysis.href}`)
        console.log(`  has schemas: ${analysis.hasSchemas}`)
        console.log(`  is search page: ${analysis.isSearchPage}`)
        console.log(`  is search-sec: ${analysis.isSearchSecPage}`)
        console.log(`  verdict: ${analysis.verdict}`)
      }
      
      // Verify no incorrect search-sec usage (except for NT7)
      const incorrectLinks = urlAnalysis.filter(a => 
        a.isSearchSecPage && !a.href.includes('nationalTarget7')
      )
      
      expect(incorrectLinks.length, 'No links should incorrectly use search-sec').toBe(0)
      
      await writeEvidenceScreenshot(page, testInfo, 'url-structure-verification')
      
      console.log('\n========================')
      console.log(`Total links analyzed: ${urlAnalysis.length}`)
      console.log(`Correct: ${urlAnalysis.filter(a => a.verdict.includes('PASS')).length}`)
      console.log(`Failed: ${incorrectLinks.length}`)
    })
  })
})
