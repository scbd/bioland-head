import { vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * Setup function to be called in beforeEach for store tests
 */
export function setupPiniaForTesting() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

/**
 * Mock Nuxt auto-imports for testing
 */
export function mockNuxtImports() {
  // Mock defineStore if needed
  global.defineStore = (name, options) => {
    const { defineStore: piniaDefineStore } = await import('pinia')
    return piniaDefineStore(name, options)
  }
}

/**
 * Helper to create a mock user object
 */
export function createMockUser(overrides = {}) {
  return {
    value: {
      userID: 'test-user-id',
      duuid: 'test-duuid',
      diuid: 'test-diuid',
      preferredLang: 'en',
      displayName: 'Test User',
      name: 'Test Name',
      email: 'test@example.com',
      img: 'test-img.jpg',
      isAuthenticated: true,
      roles: ['user'],
      token: 'test-token',
      ...overrides,
    }
  }
}

/**
 * Helper to create a mock site config
 */
export function createMockSiteConfig(overrides = {}) {
  return {
    locale: 'en',
    identifier: 'test-site',
    siteCode: 'test-site',
    defaultLocale: 'en',
    config: {
      defaultLocale: 'en',
      locales: ['en', 'fr', 'es'],
      logo: null,
      country: null,
      countries: [],
      theme: {
        color: {
          primary: '#009edb',
          secondary: '#00ff00',
        },
      },
    },
    siteName: 'Test Site',
    gaiaApi: 'https://api.test.com',
    multiSiteCode: 'test-multi',
    baseHost: 'test.localhost',
    env: 'development',
    ...overrides,
  }
}
