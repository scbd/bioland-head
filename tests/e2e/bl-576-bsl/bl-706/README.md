# BL-706: Hero Image SSR Context Fix - E2E Tests

## Overview

These tests verify the fix for BL-706, where hero images failed to render on the first SSR request due to missing context (siteCode, host, locale).

## Bug Summary

**Problem:** Hero images were not rendering on SSR because site context was undefined during initial component rendering, resulting in broken image URLs containing "undefined".

**Fix Applied:** Three-layer defense mechanism:
1. **Layer 1 (Plugin):** `site.js` plugin initializes context from cookie
2. **Layer 2 (Middleware):** `ensureSiteContext()` fetches context from API if Layer 1 fails (NEW)
3. **Layer 3 (Component):** Hero image component guards prevent rendering with undefined context (NEW)

## Test Coverage

### 1. First SSR Load Test
**File:** `bl-706.spec.ts` - Test 1

Verifies hero image renders correctly on first SSR request without context cookie.

**Validates:**
- Hero image is visible
- Background URL does not contain "undefined"
- No hydration warnings
- No context-related errors
- Context cookie is set after first load

### 2. Hydration Stability Test
**File:** `bl-706.spec.ts` - Test 2

Verifies hero image remains stable during SSR-to-client hydration.

**Validates:**
- Hero renders in SSR state
- Hero remains visible after hydration
- No visual changes or flashing
- No hydration mismatch warnings

### 3. Locale Switching Test
**File:** `bl-706.spec.ts` - Test 3

Verifies hero images work correctly when switching between locales.

**Validates:**
- Hero works in English (`/en/home`)
- Hero works in French (`/fr/home`)
- No undefined URLs in either locale

### 4. Subsequent Navigation Test
**File:** `bl-706.spec.ts` - Test 4

Verifies that once context cookie is set, subsequent page loads continue to work correctly.

**Validates:**
- First page sets context cookie
- Subsequent pages use the cookie
- Hero images work on multiple pages

### 5. Slow Network Test
**File:** `bl-706.spec.ts` - Test 5

Stress test to verify graceful degradation with slow API responses.

**Validates:**
- Hero renders even with network delays
- No crashes or critical errors
- Graceful fallback behavior

### 6. Network Requests Test
**File:** `bl-706.spec.ts` - Test 6

Monitors all network requests to ensure none contain "undefined" in URLs.

**Validates:**
- All image requests have valid URLs
- No requests to "https://undefined.undefined/..."
- No broken asset paths

## Running the Tests

### Run all BL-706 tests:
```bash
yarn test:e2e tests/e2e/bl-576-bsl/bl-706/bl-706.spec.ts
```

### Run a specific test:
```bash
yarn test:e2e tests/e2e/bl-576-bsl/bl-706/bl-706.spec.ts -g "hero image renders on first SSR load"
```

### Run with headed browser (for debugging):
```bash
yarn test:e2e tests/e2e/bl-576-bsl/bl-706/bl-706.spec.ts --headed
```

## Evidence

Test screenshots are saved to:
```
.test-results/BL-706/
  ├── bl-706-hero-first-ssr--chromium.png
  ├── bl-706-ssr-state--chromium.png
  ├── bl-706-hydrated-state--chromium.png
  ├── bl-706-locale-en--chromium.png
  ├── bl-706-locale-fr--chromium.png
  ├── bl-706-first-navigation--chromium.png
  ├── bl-706-subsequent-nav-*--chromium.png
  ├── bl-706-slow-network--chromium.png
  └── bl-706-network-check--chromium.png
```

## Related Files

### Implementation Files
- `app/components/page/header/hero-image.vue` - Hero component with guards
- `app/middleware/02.bioland.global.js` - Context fallback mechanism (`ensureSiteContext()`)
- `app/stores/page.js` - Hour-based hero selection for SSR stability
- `app/stores/site.js` - Host getter safety guard
- `server/utils/context-unified.ts` - Host normalization

### Test Files
- `tests/e2e/bl-576-bsl/bl-706/bl-706.spec.ts` - Main test suite
- `tests/e2e/bl-576-bsl/bl-706/README.md` - This file

## Key Implementation Details

### Context Cookie
The context cookie stores site configuration (siteCode, locale, etc.) and is:
- Set by the middleware after first successful context resolution
- Used by subsequent requests to avoid repeated API calls
- Must be cleared for tests simulating first-time visitors

### Test IDs
The hero image component has `data-testid="hero-image"` for reliable test selection.

### SSR vs Client Rendering
- **SSR State:** Initial HTML rendered by server
- **Hydration:** Client-side JavaScript takes over the SSR HTML
- **Critical:** Both states must render the same hero to avoid mismatches

### Hour-Based Hero Selection
Changed from minute-based to hour-based to ensure server and client select the same hero image during hydration, preventing flashing/shifting.

## Success Criteria

All tests should pass, verifying:
- ✅ Hero images render on first SSR load without cookies
- ✅ No "undefined" in image URLs
- ✅ No hydration mismatches
- ✅ Context cookie properly set
- ✅ Multi-locale support works
- ✅ Subsequent navigation works
- ✅ Graceful degradation under stress

## Troubleshooting

### Test fails with "Hero image not visible"
- Check if the page actually has a hero image configured in Drupal
- Verify the middleware `ensureSiteContext()` is being called
- Check browser console for context-related errors

### Test fails with "undefined in URL"
- The bug is not fully fixed
- Check component guards in `hero-image.vue`
- Check middleware context fallback logic

### Test fails with hydration warnings
- SSR and client are selecting different hero images
- Verify hour-based selection in `app/stores/page.js`
- Check for timing issues in component mounting

### Context cookie not set
- Check middleware is running on the test URL
- Verify cookie is not being blocked by test configuration
- Check `/api/` endpoint is responding correctly

## Notes

- Tests use consent cookies but clear context cookie to simulate first-time visitors
- Each test is independent and clears cookies before starting
- Screenshots are attached to test results for evidence
- Network monitoring helps catch undefined URLs even if they don't break visually
