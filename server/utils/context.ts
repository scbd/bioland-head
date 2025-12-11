/**
 * Context Module
 * 
 * Re-exports from context-unified.ts (new) and context-legacy.js (deprecated)
 * This file maintains backwards compatibility during migration
 */

// New unified context API - use this
export { useRequestContext, getCountryCode } from './context-unified'

// Legacy exports for backwards compatibility - deprecated
export { getContext, parseContext, parseQuery, fetchSiteConfig } from './context-legacy'

// Types
export type { SiteContext, DmsmConfig, ContextCookie } from '~/shared/types'
