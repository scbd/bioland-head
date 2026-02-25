import type { H3Event } from 'h3'

/**
 * Cache Clear Middleware
 * 
 * Handles cache invalidation when `seachain-taisce` query param is present.
 * Runs FIRST (00) to clear caches before any cached handlers execute.
 * 
 * Features:
 * - Permission-gated: Only admin roles can trigger cache clear
 * - Deduplication: Same seachain-taisce value only clears once (via Nitro storage)
 * - Request coordination: Concurrent requests with same value wait for completion
 * - CDN bypass: Stores value on event.context for forwarding to internal requests
 * 
 * Storage keys (in 'cache-clear' base):
 * - `pending:{value}` - Timestamp when clear started (for in-progress tracking)
 * - `completed:{value}` - Timestamp when clear completed (TTL: 60s)
 */

const STORAGE_BASE = 'cache-clear'
const PENDING_TTL = 30 // seconds - max time a clear can be "pending"
const COMPLETED_TTL = 60 // seconds - how long to remember completed clears

/**
 * Check if user has admin permissions for cache clearing
 */
function hasAdminPermission(event: H3Event): boolean {
  const user = event.context?.me
  
  if (!user) return false
  
  const adminRoles = ['administrator', 'site_manager', 'content_manager', 'scbd_staff']
  return user?.roles?.some((role: string) => adminRoles.includes(role)) ?? false
}

export default defineEventHandler(async (event) => {
  // Skip static assets and internal routes
  const skipPaths = ['/_nuxt', '/_ipx', '/_i18n', '/__nuxt', '/favicon.ico', '/.well-known', '/fonts']
  
  for (const path of skipPaths) {
    if (event.path.startsWith(path)) return
  }

  const { searchParams } = new URL(getRequestURL(event))
  const seachainTaisce = searchParams.get('seachain-taisce')
  
  // No bypass param - nothing to do
  if (!seachainTaisce) return

  // Store value on event.context for CDN bypass on internal requests
  // The cache-forward-query plugin will pick this up
  event.context.seachainTaisce = seachainTaisce

  const storage = useStorage(STORAGE_BASE)
  const pendingKey = `pending:${seachainTaisce}`
  const completedKey = `completed:${seachainTaisce}`

  // Already completed with this value - skip
  const completedAt = await storage.getItem<number>(completedKey)
  if (completedAt && (Date.now() - completedAt) < COMPLETED_TTL * 1000) {
    return
  }

  // Check if another container/request is already clearing with this value
  const pendingAt = await storage.getItem<number>(pendingKey)
  if (pendingAt) {
    // Check if pending is stale (older than PENDING_TTL)
    if ((Date.now() - pendingAt) < PENDING_TTL * 1000) {
      // Still in progress - wait a bit and let the original complete
      // We don't block indefinitely since we can't share promises across containers
      await new Promise(resolve => setTimeout(resolve, 500))
      return
    }
    // Stale pending - clean it up and proceed
    await storage.removeItem(pendingKey)
  }

  // Permission check - only admin roles can trigger cache clear
  // Note: auth middleware runs after this, so we need to get user here
  try {
    const user = await getUser(event)
    event.context.me = user
    
    if (!hasAdminPermission(event)) {
      // No permission - skip cache clear
      return
    }
  } catch {
    // If we can't verify user, skip cache clear for safety
    return
  }

  // Mark as pending (with timestamp for staleness detection)
  await storage.setItem(pendingKey, Date.now())

  try {
    // Perform the cache clear
    const result = await clearSiteCache(event)
    
    consola.info(`[cache-clear] Cleared ${result.count} cache entries for ${result.multiSiteCode}:${result.siteCode}`)
    
    if (result.errors.length > 0) {
      consola.warn(`[cache-clear] Errors:`, result.errors)
    }

    // Mark as completed with timestamp (acts as TTL marker)
    await storage.setItem(completedKey, Date.now())

  } catch (error) {
    consola.error(`[cache-clear] Failed to clear cache:`, error)
  } finally {
    // Always clean up pending
    await storage.removeItem(pendingKey)
  }
})
