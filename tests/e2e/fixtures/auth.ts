/**
 * E2E Authentication Setup Guide
 * 
 * This file contains authentication fixtures and utilities for role-based E2E testing with Playwright.
 * 
 * ## Overview
 * 
 * The authentication system allows tests to run as different Drupal user roles without repeatedly logging in.
 * Authentication states are saved as JSON files and reused across test runs.
 * 
 * ## Roles Supported
 * 
 * | Role | Username | Access Level | System Pages |
 * |------|----------|--------------|--------------|
 * | `scbd_staff` | `e2e_scbd_staff` | Full admin | ✅ Edit |
 * | `administrator` | `e2e_administrator` | Full admin | ✅ Edit |
 * | `site_manager` | `e2e_site_manager` | Site management | ❌ View only |
 * | `content_manager` | `e2e_content_manager` | Content editing | ❌ View only |
 * | `contributor` | `e2e_contributor` | Content contribution | ❌ View only |
 * | `authenticated` | `e2e_authenticated` | Basic logged-in | ❌ View only |
 * | `anonymous` | N/A | Public access | ❌ View only |
 * 
 * ## Setup Instructions
 * 
 * ### 1. Configure Environment Variables
 * 
 * Set these variables in your `.env` file:
 * 
 * ```bash
 * # E2E Test Configuration
 * NUXT_E2E_DRUPAL_URL=<your_drupal_url>
 * NUXT_E2E_USER_PASSWORD=<password>
 * 
 * # Usernames (must exist in Drupal with corresponding roles)
 * NUXT_E2E_USER_SCBD_STAFF=<username>
 * NUXT_E2E_USER_ADMINISTRATOR=<username>
 * NUXT_E2E_USER_SITE_MANAGER=<username>
 * NUXT_E2E_USER_CONTENT_MANAGER=<username>
 * NUXT_E2E_USER_CONTRIBUTOR=<username>
 * NUXT_E2E_USER_AUTHENTICATED=<username>
 * ```
 * 
 * ### 2. Run Auth Setup Script
 * 
 * Start your dev server, then run:
 * 
 * ```bash
 * # Ensure dev server is running
 * yarn stg-open-bsl-e2e
 * 
 * # In another terminal, run auth setup
 * yarn test:e2e:auth-setup
 * ```
 * 
 * The script will:
 * 1. Log in as each user
 * 2. Save authenticated session to `playwright/.auth/{role}.json`
 * 3. Report success/failure for each role
 * 
 * ### 3. Verify Auth Files
 * 
 * Check that auth files were created:
 * 
 * ```bash
 * ls -la playwright/.auth/
 * # Should show: scbd_staff.json, administrator.json, site_manager.json, etc.
 * ```
 * 
 * ## Using Auth Fixtures in Tests
 * 
 * ### Import the fixtures
 * 
 * ```typescript
 * import { test, expect } from '../../fixtures/auth'
 * ```
 * 
 * ### Use role-specific fixtures
 * 
 * Each fixture automatically applies the saved authentication state:
 * 
 * ```typescript
 * test.describe('Content Manager Tests', () => {
 *   test('can view but not edit system pages', async ({ page, contentManager }) => {
 *     // User is already authenticated as content_manager
 *     await page.goto('/en/about')
 *     
 *     // Verify user is logged in
 *     const warning = page.locator('[data-testid="system-page-warning"]')
 *     await expect(warning).toBeVisible()
 *     
 *     // Verify tabs are disabled
 *     const editTab = page.locator('[data-testid="page-tab-edit"]')
 *     await expect(editTab).toHaveAttribute('data-disabled', 'true')
 *   })
 * })
 * 
 * test.describe('SCBD Staff Tests', () => {
 *   test('has full access to system pages', async ({ page, scbdStaff }) => {
 *     // User is already authenticated as scbd_staff
 *     await page.goto('/en/about')
 *     
 *     // Verify no warning shown
 *     const warning = page.locator('[data-testid="system-page-warning"]')
 *     await expect(warning).not.toBeVisible()
 *     
 *     // Verify tabs are enabled
 *     const editTab = page.locator('[data-testid="page-tab-edit"]')
 *     await expect(editTab).not.toHaveAttribute('data-disabled')
 *   })
 * })
 * 
 * test.describe('Anonymous Tests', () => {
 *   test('sees public content only', async ({ page, anonymous }) => {
 *     // No authentication - default browser state
 *     await page.goto('/en/about')
 *     
 *     // Verify no tabs or edit controls
 *     const tabs = page.locator('[data-testid^="page-tab-"]')
 *     await expect(tabs).toHaveCount(0)
 *   })
 * })
 * ```
 * 
 * ## Helper Functions
 * 
 * The fixture file exports helper functions:
 * 
 * ```typescript
 * import { isAuthenticated, getCurrentUserName, verifyRoleAccess } from '../../fixtures/auth'
 * 
 * test('verify authentication', async ({ page, contentManager }) => {
 *   await page.goto('/en')
 *   
 *   // Check if user is logged in
 *   const loggedIn = await isAuthenticated(page)
 *   expect(loggedIn).toBe(true)
 *   
 *   // Get current username
 *   const userName = await getCurrentUserName(page)
 *   expect(userName).toBe('e2e_content_manager')
 *   
 *   // Verify role access (combines both checks)
 *   await verifyRoleAccess(page, 'content_manager')
 * })
 * ```
 * 
 * ## Troubleshooting
 * 
 * ### Auth setup fails with "Failed to verify login"
 * 
 * **Solution:**
 * 1. Verify dev server is running on correct port
 * 2. Check that users exist in Drupal with correct roles
 * 3. Verify password matches `NUXT_E2E_USER_PASSWORD` in `.env`
 * 
 * ### Tests fail with "storageState: file does not exist"
 * 
 * **Solution:**
 * ```bash
 * # Re-run auth setup
 * yarn test:e2e:auth-setup
 * ```
 * 
 * ### Sessions expire during test runs
 * 
 * **Solution:**
 * ```bash
 * # Re-run auth setup to refresh sessions
 * yarn test:e2e:auth-setup
 * ```
 * 
 * ### Wrong user role in tests
 * 
 * **Solution:**
 * 1. Ensure you imported from `../../fixtures/auth`, not `@playwright/test`
 * 2. Verify fixture name matches role (e.g., `contentManager` not `content_manager`)
 * 3. Check that corresponding auth file exists in `playwright/.auth/`
 * 
 * ## Security Notes
 * 
 * ⚠️ **Important Security Considerations:**
 * 
 * 1. **Never commit auth files** - They contain active session tokens (already in `.gitignore`)
 * 2. **Use dedicated test users** - Don't use production admin accounts
 * 3. **Rotate passwords regularly** - Especially after auth files are exposed
 * 4. **Limit test user permissions** - Only grant what's needed for testing
 * 5. **Use separate test environment** - Never run e2e tests against production
 * 
 * ## Maintenance
 * 
 * ### Regenerating Auth Files
 * 
 * ```bash
 * # Delete old auth files
 * rm -rf playwright/.auth/
 * 
 * # Regenerate
 * yarn test:e2e:auth-setup
 * ```
 * 
 * ### Adding New Roles
 * 
 * 1. Add environment variable to `.env.example`
 * 2. Update `tests/e2e/scripts/auth-setup.mjs` USERS object
 * 3. Update this file's `AuthFixtures` type and fixtures
 * 4. Create user in Drupal and run auth setup
 * 
 * ## Reference
 * 
 * - **Auth Script:** `tests/e2e/scripts/auth-setup.mjs`
 * - **Config:** `.env` (see `.env.example` for template)
 * - **Storage:** `playwright/.auth/{role}.json` (gitignored)
 * - **Quick Start:** `tests/e2e/QUICK-START.md`
 * - **Setup Summary:** `tests/e2e/AUTH-SETUP-SUMMARY.md`
 */

import { test as base, expect as baseExpect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path to saved auth states (contains SSESS cookies for local use)
const AUTH_DIR = path.resolve(__dirname, '../../../playwright/.auth')

/**
 * Auth fixture type definitions
 * Each fixture provides a Page with the corresponding auth state pre-loaded
 */
type AuthFixtures = {
  /** SCBD Staff role - full access to all features including system pages */
  scbdStaff: Page
  /** Site Manager role - restricted from editing system pages */
  siteManager: Page
  /** Content Manager role - restricted from editing system pages */
  contentManager: Page
  /** Contributor role - restricted from editing system pages */
  contributor: Page
  /** Authenticated user - basic logged-in user with no editing permissions */
  authenticated: Page
  /** Anonymous user - not logged in (default state) */
  anonymous: Page
}

/**
 * Create auth fixture for a specific role
 * Returns a page with the authenticated state loaded
 */
function createAuthFixture(role: string) {
  return async ({ browser }, use) => {
    const authFile = path.join(AUTH_DIR, `${role}.json`)
    
    const context = await browser.newContext({
      storageState: authFile,
    })
    
    const page = await context.newPage()
    
    await use(page)
    
    await page.close()
    await context.close()
  }
}

/**
 * Extended test with auth fixtures
 */
export const test = base.extend<AuthFixtures>({
  // Privileged role (no system page restrictions)
  scbdStaff: createAuthFixture('scbd_staff'),
  
  // Restricted roles (system page editing disabled)
  siteManager: createAuthFixture('site_manager'),
  contentManager: createAuthFixture('content_manager'),
  contributor: createAuthFixture('contributor'),
  
  // Non-editing roles
  authenticated: createAuthFixture('authenticated'),
  
  // Anonymous - creates a fresh page without auth
  anonymous: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await use(page)
    await page.close()
    await context.close()
  },
})

export { baseExpect as expect }

/**
 * Helper to check if user is authenticated
 */
export async function isAuthenticated(page) {
  try {
    const userMenu = page.locator('a[href*="/user/logout"], .user-menu, [data-user-name]').first()
    return await userMenu.isVisible({ timeout: 2000 })
  } catch {
    return false
  }
}

/**
 * Helper to get current user name (if logged in)
 */
export async function getCurrentUserName(page) {
  try {
    const userElement = page.locator('[data-user-name]').first()
    if (await userElement.isVisible({ timeout: 2000 })) {
      return await userElement.getAttribute('data-user-name')
    }
  } catch {}
  return null
}

/**
 * Helper to verify role-specific access
 */
export async function verifyRoleAccess(page, expectedRole: string) {
  const isLoggedIn = await isAuthenticated(page)
  const userName = await getCurrentUserName(page)
  
  if (expectedRole === 'anonymous') {
    expect(isLoggedIn).toBe(false)
    return
  }
  
  expect(isLoggedIn).toBe(true)
  
  if (userName) {
    // Verify username matches expected pattern (e2e-{role})
    const expectedUsername = `e2e-${expectedRole.replace('_', '-')}`
    expect(userName).toBe(expectedUsername)
  }
}
