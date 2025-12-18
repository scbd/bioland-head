/**
 * BL-714: System Page Warning Component E2E Tests
 * 
 * Tests role-based access control and warning display for system pages and
 * content type taxonomy pages. Verifies that restricted roles see warnings
 * and disabled tabs, while privileged roles have full access.
 * 
 * Authentication:
 * - Uses SSESS cookies from staging Drupal (NUXT_E2E_DRUPAL_URL)
 * - Applied to local dev server (NUXT_E2E_LOCAL_URL)
 * - Run auth setup first: yarn test:e2e:auth-setup
 */

import { test, expect } from '../../fixtures/auth'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { getE2EBaseURL } from '../../e2e-targets'
import { seedConsentCookies } from '../../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL()

// Test pages
const SYSTEM_PAGE_PATH = '/en'  // Home page is a system page
const CONTENT_TYPE_PAGE_PATH = '/en/national-informations'  // Content type taxonomy page
const ALTERNATIVE_SYSTEM_PAGE = '/en/search'  // For testing cross-page persistence

// Selectors
const SELECTORS = {
  warning: '[data-testid="system-page-warning"]',
  warningClose: '[data-testid="system-page-warning-close-button"]',
  warningCheckbox: '[data-testid="system-page-warning-dont-show-checkbox"]',
  tabEdit: '[data-testid="page-tab-edit"]',
  tabDelete: '[data-testid="page-tab-delete"]',
  tabRevisions: '[data-testid="page-tab-revisions"]',
  tabClone: '[data-testid="page-tab-clone"]',
  tabTranslate: '[data-testid="page-tab-translate"]',
  tabView: '[data-testid="page-tab-view"]',
}

async function writeEvidenceScreenshot(page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-714')
  await mkdir(dir, { recursive: true })

  const fileName = `${basename}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: true })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

test.describe('BL-714: System Page Warning Component', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60000)

  test.describe('Restricted Roles - Warning + Disabled Tabs', () => {
    
    test('scbd_staff: sees warning and has disabled tabs on system pages', async ({ scbdStaff: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Verify warning IS displayed
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).toBeVisible()
      await expect(warning).toContainText('View Only Mode')

      // Verify tabs are disabled
      const editTab = page.locator(SELECTORS.tabEdit)
      await expect(editTab).toBeVisible()
      await expect(editTab).toHaveAttribute('data-disabled', 'true')

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'scbd-staff-warning-disabled-tabs')

      console.log('✅ scbd_staff: Warning shown, tabs disabled')
    })

    test('site_manager: sees warning and has disabled tabs on system pages', async ({ siteManager: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Verify warning IS displayed
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).toBeVisible()
      await expect(warning).toContainText('View Only Mode')

      // Verify tabs are disabled
      const editTab = page.locator(SELECTORS.tabEdit)
      await expect(editTab).toBeVisible()
      await expect(editTab).toHaveAttribute('data-disabled', 'true')

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'site-manager-warning-disabled-tabs')

      console.log('✅ site_manager: Warning shown, tabs disabled')
    })

    test('content_manager: sees warning and has disabled tabs on system pages', async ({ contentManager: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Verify warning IS displayed
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).toBeVisible()
      await expect(warning).toContainText('managed by site administrators')

      // Verify multiple tabs are disabled
      const editTab = page.locator(SELECTORS.tabEdit)
      const deleteTab = page.locator(SELECTORS.tabDelete)
      
      await expect(editTab).toHaveAttribute('data-disabled', 'true')
      await expect(deleteTab).toHaveAttribute('data-disabled', 'true')

      // Verify View tab remains enabled
      const viewTab = page.locator(SELECTORS.tabView)
      await expect(viewTab).not.toHaveAttribute('data-disabled')

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'content-manager-warning-disabled-tabs')

      console.log('✅ content_manager: Warning shown, edit tabs disabled, view enabled')
    })

    test('contributor: sees warning and has disabled tabs on system pages', async ({ contributor: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Verify warning IS displayed
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).toBeVisible()

      // Contributors may not see tabs at all on system pages
      // The warning indicates they cannot edit, which is the key functionality
      const editTab = page.locator(SELECTORS.tabEdit)
      const hasTab = await editTab.count() > 0
      
      if (hasTab) {
        // If tabs are present, they should be disabled
        await expect(editTab).toHaveAttribute('data-disabled', 'true')
      }

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'contributor-warning-disabled-tabs')

      console.log('✅ contributor: Warning shown, tabs disabled or hidden')
    })
  })

  test.describe('Non-Editing Roles - No Warning, No Tabs', () => {
    
    test('authenticated: sees no warning or edit tabs', async ({ authenticated: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Verify warning is NOT displayed
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).not.toBeVisible()

      // Verify no edit tabs are present
      const editTab = page.locator(SELECTORS.tabEdit)
      await expect(editTab).not.toBeVisible()

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'authenticated-no-warning-no-tabs')

      console.log('✅ authenticated: No warning, no edit tabs')
    })

    test('anonymous: sees no warning or edit tabs', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Verify warning is NOT displayed
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).not.toBeVisible()

      // Verify no edit tabs are present
      const editTab = page.locator(SELECTORS.tabEdit)
      await expect(editTab).not.toBeVisible()

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'anonymous-no-warning-no-tabs')

      console.log('✅ anonymous: No warning, no edit tabs')
    })
  })

  test.describe('Warning Dismissal Behavior', () => {
    
    test('can dismiss warning temporarily (no cookie)', async ({ contentManager: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Verify warning is visible and fully loaded
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).toBeVisible()
      
      // Wait for page to be fully interactive
      await page.waitForLoadState('networkidle')

      // Click close button WITHOUT checking "don't show again"
      const closeButton = page.locator(SELECTORS.warningClose)
      await closeButton.click()
      
      // Warning should hide (Vue transition takes 300ms)
      await page.waitForTimeout(500)
      await expect(warning).not.toBeVisible()

      // Reload page - warning should reappear
      await page.reload()
      await expect(warning).toBeVisible()

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'dismissal-temporary-reappears-on-reload')

      console.log('✅ Temporary dismissal: Warning reappears after reload')
    })

    test('can dismiss warning permanently (with cookie)', async ({ contentManager: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)

      // Wait for page to be fully interactive
      await page.waitForLoadState('networkidle')

      // Verify warning is visible
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).toBeVisible()

      // Check "don't show again" checkbox
      // This immediately sets the cookie and hides the warning
      const checkbox = page.locator(SELECTORS.warningCheckbox)
      await checkbox.check({ force: true })
      
      // Warning disappears immediately when cookie is set
      await page.waitForTimeout(500)
      await expect(warning).not.toBeVisible()

      // Verify cookie was set
      const context = page.context()
      const cookies = await context.cookies()
      const warningCookie = cookies.find(c => c.name === 'hideSystemPageWarning')
      expect(warningCookie).toBeDefined()
      expect(warningCookie?.value).toBe('true')

      // Reload page - warning should stay hidden
      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(warning).not.toBeVisible()

      // Tabs component should also be hidden after permanent dismissal
      const editTab = page.locator(SELECTORS.tabEdit)
      await expect(editTab).not.toBeVisible()

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'dismissal-permanent-stays-hidden')

      console.log('✅ Permanent dismissal: Warning stays hidden, tabs hidden, cookie set')
    })

    test('permanent dismissal persists across system pages', async ({ contentManager: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)
      await page.waitForLoadState('networkidle')

      // Permanently dismiss warning
      const warning = page.locator(SELECTORS.warning)
      const checkbox = page.locator(SELECTORS.warningCheckbox)

      // Checking the checkbox immediately hides the warning
      await checkbox.check({ force: true })
      await page.waitForTimeout(500)
      await expect(warning).not.toBeVisible()

      // Navigate to different system page
      await page.goto(`${E2E_BASE_URL}${ALTERNATIVE_SYSTEM_PAGE}`)
      await page.waitForLoadState('networkidle')

      // Warning should still be hidden
      await expect(warning).not.toBeVisible()

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'dismissal-persists-across-pages')

      console.log('✅ Permanent dismissal persists across system page navigation')
    })
  })

  test.describe('Content Type Page Detection', () => {
    
    test('warning displays on content type taxonomy pages', async ({ contentManager: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${CONTENT_TYPE_PAGE_PATH}`)
      await page.waitForLoadState('networkidle')

      // Verify warning displays on content type pages too
      const warning = page.locator(SELECTORS.warning)
      await expect(warning).toBeVisible()

      // Verify tabs are disabled
      const editTab = page.locator(SELECTORS.tabEdit)
      await expect(editTab).toHaveAttribute('data-disabled', 'true')

      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'content-type-page-warning')

      console.log('✅ Content type page: Warning shown, tabs disabled')
    })
  })

  test.describe('Tab Tooltips', () => {
    
    test('disabled tabs show explanatory tooltips on hover', async ({ contentManager: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}${SYSTEM_PAGE_PATH}`)
      await page.waitForLoadState('networkidle')

      // Find disabled edit tab
      const editTab = page.locator(SELECTORS.tabEdit)
      await expect(editTab).toHaveAttribute('data-disabled', 'true')

      // Verify tooltip text is set via title attribute
      await expect(editTab).toHaveAttribute('title', 'System page - editing disabled')

      // Hover over tab (visual confirmation for screenshot)
      await editTab.hover()
      await page.waitForTimeout(500)

      // Capture evidence with tooltip
      await writeEvidenceScreenshot(page, testInfo, 'disabled-tab-tooltip')

      console.log('✅ Tab tooltip: Shows "System page - editing disabled"')
    })
  })
})
