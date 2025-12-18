/**
 * BL-715: Side Image Rendering E2E Tests
 * 
 * Tests that side images render correctly after fixing attribute ordering
 * in the NuxtImg component. Verifies image display, dimensions, accessibility,
 * and responsiveness.
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

// Test pages with side images
// Note: Tests must run against BSL target (E2E_TARGET=bsl) which has actual content
// Run with: E2E_TARGET=bsl yarn test:e2e tests/e2e/bl-576-bsl/bl-715/bl-715.spec.ts
const TEST_PATHS = [
  '/en',  // Home page (may have side image)
  '/en/about',  // About page (typically has side image)
]

// Selectors
const SELECTORS = {
  sideImage: '#page-body-side-image-img',
  sideImageContainer: '#page-body-side-image',
  sideImageLink: '#page-body-side-image-link',
  pageBody: '#page-body',
}

async function writeEvidenceScreenshot(page: Page, testInfo: TestInfo, basename: string): Promise<string> {
  const dir = path.join(process.cwd(), '.test-results', 'BL-715')
  await mkdir(dir, { recursive: true })

  const fileName = `${basename}--${testInfo.project.name}.png`
  const filePath = path.join(dir, fileName)

  await page.screenshot({ path: filePath, fullPage: true })
  await testInfo.attach(fileName, { path: filePath, contentType: 'image/png' })

  return filePath
}

/**
 * Find and navigate to a node page that contains a side image.
 * Strategy:
 * - Visit each path in TEST_PATHS
 * - Look for links to '/node/' and navigate to them, checking for a visible side image
 * - As a fallback, check the TEST_PATHS pages themselves for a side image
 */
async function findNodePageWithSideImage(page: Page): Promise<{found: boolean, url?: string}> {
  for (const p of TEST_PATHS) {
    await page.goto(`${E2E_BASE_URL}${p}`)
    await page.waitForLoadState('networkidle')

    const anchors = page.locator('a[href*="/node/"]')
    const count = await anchors.count()
    for (let i = 0; i < count; i++) {
      const href = await anchors.nth(i).getAttribute('href')
      if (!href) continue
      const target = new URL(href, E2E_BASE_URL).href
      await page.goto(target)
      await page.waitForLoadState('networkidle')
      // small pause for client rendering
      await page.waitForTimeout(300)

      const img = page.locator(SELECTORS.sideImage)
      if ((await img.count()) > 0 && await img.isVisible()) {
        return { found: true, url: target }
      }
    }
  }

  // Fallback: check the TEST_PATHS pages themselves for a side image
  for (const p of TEST_PATHS) {
    await page.goto(`${E2E_BASE_URL}${p}`)
    await page.waitForLoadState('networkidle')
    const img = page.locator(SELECTORS.sideImage)
    if ((await img.count()) > 0 && await img.isVisible()) {
      return { found: true, url: `${E2E_BASE_URL}${p}` }
    }
  }

  return { found: false }
}

test.describe('BL-715: Side Image Rendering', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60000)

  test.describe('Side Image Display and Attributes', () => {
    
    test('side image renders correctly with proper attributes', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Find a node page that contains a side image (navigates to the node page)
      const result = await findNodePageWithSideImage(page)
      expect(result.found, `No node page with side image found on any path. Tested: ${TEST_PATHS.join(', ')}`).toBe(true)

      const imageElement = page.locator(SELECTORS.sideImage)
      const testPath = result.url || TEST_PATHS[0]
      
      // Verify image is visible
      await expect(imageElement).toBeVisible()
      
      // Verify image has src attribute
      const src = await imageElement.getAttribute('src')
      expect(src).toBeTruthy()
      expect(src).not.toBe('')
      
      // Verify image has alt attribute for accessibility
      const alt = await imageElement.getAttribute('alt')
      expect(alt).not.toBeNull()
      
      // Verify image has proper dimensions (whole numbers, no subpixel values)
      const width = await imageElement.getAttribute('width')
      const height = await imageElement.getAttribute('height')
      
      if (width) {
        const widthNum = parseFloat(width)
        expect(widthNum).toBe(Math.floor(widthNum)) // Should be whole number
        expect(widthNum).toBeGreaterThan(0)
      }
      
      if (height) {
        const heightNum = parseFloat(height)
        expect(heightNum).toBe(Math.floor(heightNum)) // Should be whole number
        expect(heightNum).toBeGreaterThan(0)
      }
      
      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'side-image-rendering')
      
      console.log('✅ Side image rendered correctly with proper attributes')
      console.log(`   - Path: ${testPath}`)
      console.log(`   - Src: ${src?.substring(0, 50)}...`)
      console.log(`   - Alt: ${alt}`)
      console.log(`   - Width: ${width}, Height: ${height}`)
    })

    test('side image has correct container structure', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Find a page with side image
      let hasImage = false
      
      for (const path of TEST_PATHS) {
        await page.goto(`${E2E_BASE_URL}${path}`)
        await page.waitForLoadState('networkidle')
        
        const imageElement = page.locator(SELECTORS.sideImage)
        const imageCount = await imageElement.count()
        
        if (imageCount > 0 && await imageElement.isVisible()) {
          hasImage = true
          break
        }
      }

      expect(hasImage, `No side image found on any test path. Tested: ${TEST_PATHS.join(', ')}`).toBe(true)

      // Verify container structure
      const container = page.locator(SELECTORS.sideImageContainer)
      await expect(container).toBeVisible()
      
      const link = page.locator(SELECTORS.sideImageLink)
      await expect(link).toBeVisible()
      
      const image = page.locator(SELECTORS.sideImage)
      await expect(image).toBeVisible()
      
      // Verify image is inside link
      const imageInLink = link.locator(SELECTORS.sideImage)
      await expect(imageInLink).toBeVisible()
      
      console.log('✅ Side image container structure is correct')
    })

    test('side image maintains proper aspect ratio and responsive classes', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Find a page with side image
      let hasImage = false
      
      for (const path of TEST_PATHS) {
        await page.goto(`${E2E_BASE_URL}${path}`)
        await page.waitForLoadState('networkidle')
        
        const imageElement = page.locator(SELECTORS.sideImage)
        const imageCount = await imageElement.count()
        
        if (imageCount > 0 && await imageElement.isVisible()) {
          hasImage = true
          break
        }
      }

      expect(hasImage, `No side image found on any test path. Tested: ${TEST_PATHS.join(', ')}`).toBe(true)

      const imageElement = page.locator(SELECTORS.sideImage)
      
      // Verify responsive image classes
      const className = await imageElement.getAttribute('class')
      expect(className).toContain('img-fluid')
      expect(className).toContain('w-100')
      
      // Get actual rendered dimensions
      const boundingBox = await imageElement.boundingBox()
      expect(boundingBox).not.toBeNull()
      
      if (boundingBox) {
        expect(boundingBox.width).toBeGreaterThan(0)
        expect(boundingBox.height).toBeGreaterThan(0)
        
        // Verify no layout shift (image has dimensions)
        const width = await imageElement.getAttribute('width')
        const height = await imageElement.getAttribute('height')
        expect(width).toBeTruthy()
        expect(height).toBeTruthy()
      }
      
      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'side-image-responsive')
      
      console.log('✅ Side image has proper responsive classes and dimensions')
      console.log(`   - Classes: ${className}`)
      console.log(`   - Rendered size: ${boundingBox?.width}x${boundingBox?.height}`)
    })
  })

  test.describe('Browser Console Verification', () => {
    
    test('no console errors related to image loading', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      const consoleErrors: string[] = []
      
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })
      
      // Find a page with side image
      let hasImage = false
      
      for (const path of TEST_PATHS) {
        await page.goto(`${E2E_BASE_URL}${path}`)
        await page.waitForLoadState('networkidle')
        
        const imageElement = page.locator(SELECTORS.sideImage)
        const imageCount = await imageElement.count()
        
        if (imageCount > 0 && await imageElement.isVisible()) {
          hasImage = true
          break
        }
      }

      expect(hasImage, `No side image found on any test path. Tested: ${TEST_PATHS.join(', ')}`).toBe(true)

      // Wait a bit to catch any delayed errors
      await page.waitForTimeout(2000)
      
      // Filter for image-related errors
      const imageErrors = consoleErrors.filter(err => 
        err.toLowerCase().includes('image') ||
        err.toLowerCase().includes('img') ||
        err.toLowerCase().includes('nuxt-img') ||
        err.toLowerCase().includes('failed to load')
      )
      
      // Capture evidence even if errors exist
      await writeEvidenceScreenshot(page, testInfo, 'console-verification')
      
      expect(imageErrors).toHaveLength(0)
      
      console.log('✅ No image-related console errors detected')
      if (consoleErrors.length > 0) {
        console.log(`   - Total console errors: ${consoleErrors.length} (none image-related)`)
      }
    })
  })

  test.describe('Viewport Responsiveness', () => {
    
    test('side image renders on desktop viewport', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 })
      
      // Find a page with side image
      let hasImage = false
      
      for (const path of TEST_PATHS) {
        await page.goto(`${E2E_BASE_URL}${path}`)
        await page.waitForLoadState('networkidle')
        
        const imageElement = page.locator(SELECTORS.sideImage)
        const imageCount = await imageElement.count()
        
        if (imageCount > 0 && await imageElement.isVisible()) {
          hasImage = true
          break
        }
      }

      expect(hasImage, `No side image found on any test path. Tested: ${TEST_PATHS.join(', ')}`).toBe(true)

      const imageElement = page.locator(SELECTORS.sideImage)
      await expect(imageElement).toBeVisible()
      
      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'desktop-viewport')
      
      console.log('✅ Side image visible on desktop viewport (1920x1080)')
    })

    test('side image hidden on mobile viewport (Bootstrap d-none d-md-block)', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      
      // Find a page
      await page.goto(`${E2E_BASE_URL}${TEST_PATHS[0]}`)
      await page.waitForLoadState('networkidle')
      
      const sideColumn = page.locator('#page-body-side')
      
      // Side column should be hidden on mobile due to d-none d-md-block classes
      const isVisible = await sideColumn.isVisible()
      
      // Capture evidence
      await writeEvidenceScreenshot(page, testInfo, 'mobile-viewport')
      
      // On mobile, the side column (and thus the side image) should be hidden
      expect(isVisible).toBe(false)
      
      console.log('✅ Side image column correctly hidden on mobile viewport (375x667)')
    })
  })

  test.describe('Regression - Other Image Types', () => {
    
    test('media images still render correctly', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
      await page.goto(`${E2E_BASE_URL}/en`)
      await page.waitForLoadState('networkidle')
      
      // Check if media image exists (image/video page type)
      const mediaImage = page.locator('#page-body-media-img')
      const mediaImageCount = await mediaImage.count()
      
      if (mediaImageCount > 0) {
        await expect(mediaImage).toBeVisible()
        
        const src = await mediaImage.getAttribute('src')
        expect(src).toBeTruthy()
        
        console.log('✅ Media images render correctly (regression check)')
      } else {
        console.log('ℹ️  No media images on this page to test')
      }
    })
  })

  test.describe('Evidence - specific page node', () => {
    test('capture evidence for /en/national-informations/decisions-or-any-other-communications', async ({ anonymous: page }, testInfo) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)

      const targetPath = '/en/national-informations/decisions-or-any-other-communications'
      await page.goto(`${E2E_BASE_URL}${targetPath}`)
      await page.waitForLoadState('networkidle')

      // Try to find node links on the page and navigate to the first node that has a side image
      const anchors = page.locator('a[href*="/node/"]')
      let nodeFound = false
      let nodeUrl = ''
      const anchorCount = await anchors.count()

      for (let i = 0; i < anchorCount; i++) {
        const href = await anchors.nth(i).getAttribute('href')
        if (!href) continue
        const url = new URL(href, E2E_BASE_URL).href
        await page.goto(url)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(300)

        const img = page.locator(SELECTORS.sideImage)
        if ((await img.count()) > 0 && await img.isVisible()) {
          nodeFound = true
          nodeUrl = url
          break
        }
      }

      // Fallback: check the target page itself for a side image
      if (!nodeFound) {
        const img = page.locator(SELECTORS.sideImage)
        if ((await img.count()) > 0 && await img.isVisible()) {
          nodeFound = true
          nodeUrl = `${E2E_BASE_URL}${targetPath}`
        }
      }

      expect(nodeFound, `No node with side image found for path ${targetPath}`).toBe(true)

      // Ensure we are on the node page that has the image
      if (nodeUrl && page.url() !== nodeUrl) {
        await page.goto(nodeUrl)
        await page.waitForLoadState('networkidle')
      }

      const imageElement = page.locator(SELECTORS.sideImage)
      await expect(imageElement).toBeVisible()

      // Capture full page screenshot and element screenshot
      const full = await writeEvidenceScreenshot(page, testInfo, 'bl-715-node-fullpage')

      const dir = path.join(process.cwd(), '.test-results', 'BL-715')
      await mkdir(dir, { recursive: true })
      const elFile = path.join(dir, `bl-715-node-element--${testInfo.project.name}.png`)
      await imageElement.screenshot({ path: elFile })
      await testInfo.attach('bl-715-node-element.png', { path: elFile, contentType: 'image/png' })

      console.log(`✅ Evidence captured for node: ${nodeUrl}`)
    })
  })
})
