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
 * Storage keys (in 'cache-clear' base, shared across containers: Redis when NUXT_REDIS_URL is set,
 * see server/plugins/00.1.cache-storage.ts, else the shared cache volume from nuxt.config):
 * - `pending:{value}` - Timestamp when clear started (for in-progress tracking)
 * - `completed:{value}` - Timestamp when clear completed (TTL: 60s)
 *
 * The fs driver ignores TTLs, so markers older than COMPLETED_TTL are pruned on each run
 * to keep the directory from growing one file per login.
 *
 * If the marker store is unreachable (it throws: the Redis `cache-clear` mount is deliberately
 * not degraded), the clear is skipped and logged rather than run without coordination or
 * turned into a 500. The `cache` mount lives on the same store, so the clear could not succeed.
 */

const STORAGE_BASE = 'cache-clear'
const PENDING_TTL = 30 // seconds - max time a clear can be "pending"
const COMPLETED_TTL = 60 // seconds - how long to remember completed clears

/**
 * Check if user has admin permissions for cache clearing (shared role list in nitro-cache.js)
 */
function hasAdminPermission(event: H3Event): boolean {
  return hasCacheAdminRole(event.context?.me)
}

/**
 * Remove pending/completed markers past their useful life. One tiny file per clear on a
 * store that never expires anything adds up; a login page adds one per sign-in.
 * Only a readable timestamp past its TTL is removed: a null (missed or concurrently removed
 * read) or any other value proves nothing about age, so it is left alone.
 */
async function pruneStaleMarkers(storage: ReturnType<typeof useStorage>): Promise<void> {
  const now = Date.now()
  const keys = await storage.getKeys()

  await Promise.all(keys.map(async (key) => {
    const ttl = key.startsWith('pending:') ? PENDING_TTL : COMPLETED_TTL
    const at = await storage.getItem<number>(key)
    if (typeof at === 'number' && (now - at) > ttl * 1000) await storage.removeItem(key)
  }))
}

/**
 * True when this value was already cleared within COMPLETED_TTL, or another container/request
 * holds a fresh pending marker (after yielding briefly to it). A stale pending marker is removed.
 */
async function isCompletedOrInProgress(storage: ReturnType<typeof useStorage>, completedKey: string, pendingKey: string): Promise<boolean> {
  const completedAt = await storage.getItem<number>(completedKey)
  if (completedAt && (Date.now() - completedAt) < COMPLETED_TTL * 1000) return true

  const pendingAt = await storage.getItem<number>(pendingKey)
  if (!pendingAt) return false
  if ((Date.now() - pendingAt) < PENDING_TTL * 1000) {
    // Still in progress - wait a bit and let the original complete.
    // We don't block indefinitely since we can't share promises across containers.
    await new Promise(resolve => setTimeout(resolve, 500))
    return true
  }
  await storage.removeItem(pendingKey)
  return false
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

  // The value becomes a storage key (`pending:<value>`); anything outside this shape is either
  // an unstorage `..` rejection (a 500 for the requester) or nested directories the pruner
  // never visits. Legitimate values are timestamps or short tokens.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(seachainTaisce)) return

  // Store value on event.context for CDN bypass on internal requests
  // The cache-forward-query plugin will pick this up
  event.context.seachainTaisce = seachainTaisce

  const storage = useStorage(STORAGE_BASE)
  const pendingKey = `pending:${seachainTaisce}`
  const completedKey = `completed:${seachainTaisce}`

  try {
    if (await isCompletedOrInProgress(storage, completedKey, pendingKey)) return
  } catch (error) {
    consola.warn('[cache-clear] Marker store unavailable, skipping cache clear:', error)
    return
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

  // Mark as pending (with timestamp for staleness detection). Without it other containers
  // would not see the clear in progress, so a failed write skips the clear.
  try {
    await storage.setItem(pendingKey, Date.now())
  } catch (error) {
    consola.warn('[cache-clear] Pending marker write failed, skipping cache clear:', error)
    return
  }

  await pruneStaleMarkers(storage).catch((error) => consola.warn('[cache-clear] Marker prune failed:', error))

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
    // Always clean up pending. A failed removal (store unreachable) must not turn the page
    // into a 500; the marker ages out after PENDING_TTL.
    await storage.removeItem(pendingKey).catch((error) => consola.warn('[cache-clear] Pending marker removal failed:', error))
  }
})
