/**
 * E2E Authentication Setup Script
 * 
 * This script logs in to the REMOTE staging Drupal server, extracts SSESS cookies,
 * and saves them for use with the LOCAL dev server. This allows testing with real
 * user roles from staging without needing to create users locally.
 * 
 * How it works:
 * 1. Log into NUXT_E2E_DRUPAL_URL (staging) as each role
 * 2. Extract the SSESS* cookie from authenticated session
 * 3. Save cookie with local URL context for NUXT_E2E_LOCAL_URL
 * 4. Tests apply saved cookies to local dev server
 * 
 * Prerequisites:
 * 1. Users must exist on staging Drupal with correct roles
 * 2. Configure usernames and password in .env file
 * 3. Staging Drupal must be accessible
 * 
 * Usage:
 *   node tests/e2e/scripts/auth-setup.mjs
 *   OR
 *   yarn test:e2e:auth-setup
 */

import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '../../..')

// Load environment variables
dotenv.config({ path: path.join(ROOT_DIR, '.env') })

// Remote staging Drupal where we log in
const REMOTE_DRUPAL_URL = process.env.NUXT_E2E_DRUPAL_URL || 'https://seed.bsl.staging.cbd.int'
// Local dev server where we run tests
const LOCAL_TEST_URL = process.env.NUXT_E2E_LOCAL_URL || 'http://e2e.localhost:3330'
const PASSWORD = process.env.NUXT_E2E_USER_PASSWORD

const USERS = {
  scbd_staff: process.env.NUXT_E2E_USER_SCBD_STAFF,
  site_manager: process.env.NUXT_E2E_USER_SITE_MANAGER,
  content_manager: process.env.NUXT_E2E_USER_CONTENT_MANAGER,
  contributor: process.env.NUXT_E2E_USER_CONTRIBUTOR,
  authenticated: process.env.NUXT_E2E_USER_AUTHENTICATED,
}

const AUTH_DIR = path.join(ROOT_DIR, 'playwright/.auth')

async function loginAndExtractCookie(username, role) {
  console.log(`\n🔐 Authenticating as ${role} (${username})...`)
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    baseURL: REMOTE_DRUPAL_URL,
  })
  const page = await context.newPage()

  try {
    // Navigate to login page on REMOTE staging server
    console.log(`   Logging into: ${REMOTE_DRUPAL_URL}/user/login`)
    await page.goto('/user/login', { waitUntil: 'networkidle' })
    
    // Wait for login form to be visible (SPA might take time to render)
    await page.waitForSelector('input[name="name"]', { timeout: 10000 })
    
    // Fill login form
    await page.fill('input[name="name"]', username)
    await page.fill('input[name="pass"]', PASSWORD)
    
    // Click submit - try multiple selectors
    const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first()
    await submitButton.click({ timeout: 10000 })
    
    // Wait for redirect after successful login
    await page.waitForURL(/.*\/(en|fr).*/, { timeout: 10000 })
    
    // Verify we're logged in by checking we're NOT on the login page anymore
    // and looking for common logged-in indicators
    const currentUrl = page.url()
    if (currentUrl.includes('/user/login')) {
      throw new Error(`Failed to verify login for ${username} - still on login page`)
    }
    
    // Optional: Try to verify with common logged-in elements (but don't fail if not found)
    const hasLogoutLink = await page.locator('a[href*="/user/logout"], a[href*="/logout"]').first().isVisible().catch(() => false)
    console.log(`   ✓ Login successful${hasLogoutLink ? ' (logout link found)' : ' (redirected from login)'}`)
    
    // Extract SSESS cookie from staging
    const cookies = await context.cookies()
    const ssessCookie = cookies.find(c => c.name.startsWith('SSESS'))
    
    if (!ssessCookie) {
      throw new Error(`No SSESS cookie found for ${username}`)
    }
    
    console.log(`   ✓ Extracted cookie: ${ssessCookie.name}=${ssessCookie.value.substring(0, 20)}...`)
    
    // Parse LOCAL_TEST_URL to get domain components
    const localUrl = new URL(LOCAL_TEST_URL)
    
    // Create cookie for LOCAL server with staging SSESS value
    const localCookie = {
      name: ssessCookie.name,
      value: ssessCookie.value,
      domain: localUrl.hostname,
      path: '/',
      expires: ssessCookie.expires || -1,
      httpOnly: ssessCookie.httpOnly || true,
      secure: ssessCookie.secure || false,
      sameSite: ssessCookie.sameSite || 'Lax',
    }
    
    // Save as storage state for Playwright to use with local URL
    const authFile = path.join(AUTH_DIR, `${role}.json`)
    const storageState = {
      cookies: [localCookie],
      origins: [
        {
          origin: LOCAL_TEST_URL,
          localStorage: [],
        },
      ],
    }
    
    await writeFile(authFile, JSON.stringify(storageState, null, 2))
    
    console.log(`✅ ${role}: Cookie saved for local use`)
    console.log(`   Remote: ${REMOTE_DRUPAL_URL}`)
    console.log(`   Local:  ${LOCAL_TEST_URL}`)
    console.log(`   File:   ${authFile}`)
    
  } catch (error) {
    console.error(`❌ ${role}: Authentication failed`)
    console.error(`   Error: ${error.message}`)
    throw error
  } finally {
    await browser.close()
  }
}

async function setupAuthentication() {
  console.log('🚀 E2E Authentication Setup')
  console.log('=' .repeat(60))
  console.log(`Remote Drupal: ${REMOTE_DRUPAL_URL}`)
  console.log(`Local Test URL: ${LOCAL_TEST_URL}`)
  console.log(`Auth storage: ${AUTH_DIR}`)
  
  // Validate configuration
  if (!PASSWORD) {
    throw new Error('NUXT_E2E_USER_PASSWORD not set in .env file')
  }
  
  if (!REMOTE_DRUPAL_URL || !LOCAL_TEST_URL) {
    throw new Error('Both NUXT_E2E_DRUPAL_URL and NUXT_E2E_LOCAL_URL must be set in .env file')
  }
  
  const missingUsers = Object.entries(USERS).filter(([_, username]) => !username)
  if (missingUsers.length > 0) {
    console.warn('\n⚠️  Warning: The following users are not configured:')
    missingUsers.forEach(([role]) => {
      console.warn(`   - NUXT_E2E_USER_${role.toUpperCase()}`)
    })
  }
  
  // Create auth directory
  await mkdir(AUTH_DIR, { recursive: true })
  console.log(`\n📁 Created auth directory: ${AUTH_DIR}`)
  
  // Login as each user and extract cookies
  const results = {
    success: [],
    failed: [],
    skipped: [],
  }
  
  for (const [role, username] of Object.entries(USERS)) {
    if (!username) {
      console.log(`\n⏭️  Skipping ${role} (not configured)`)
      results.skipped.push(role)
      continue
    }
    
    try {
      await loginAndExtractCookie(username, role)
      results.success.push(role)
    } catch (error) {
      results.failed.push({ role, error: error.message })
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Authentication Setup Summary')
  console.log('='.repeat(60))
  console.log(`✅ Success: ${results.success.length} role(s)`)
  if (results.success.length > 0) {
    results.success.forEach(role => console.log(`   - ${role}`))
  }
  
  if (results.skipped.length > 0) {
    console.log(`\n⏭️  Skipped: ${results.skipped.length} role(s)`)
    results.skipped.forEach(role => console.log(`   - ${role}`))
  }
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length} role(s)`)
    results.failed.forEach(({ role, error }) => {
      console.log(`   - ${role}: ${error}`)
    })
    throw new Error('Some authentications failed')
  }
  
  console.log('\n✨ Authentication setup complete!')
  console.log('\n🎯 How it works:')
  console.log(`   1. Logged into staging: ${REMOTE_DRUPAL_URL}`)
  console.log(`   2. Extracted SSESS cookies from authenticated sessions`)
  console.log(`   3. Saved cookies for local use: ${LOCAL_TEST_URL}`)
  console.log('\nNext steps:')
  console.log('1. Start local dev server: yarn stg-open-bsl-e2e')
  console.log('2. Run tests: yarn test:e2e')
  console.log('3. Tests will apply staging cookies to local server')
  console.log('4. Re-run this script if sessions expire')
}

// Run setup
setupAuthentication().catch(error => {
  console.error('\n💥 Setup failed:', error.message)
  process.exit(1)
})
