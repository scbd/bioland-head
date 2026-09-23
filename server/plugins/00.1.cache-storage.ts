import redisDriver from 'unstorage/drivers/redis'
import type { Driver, Storage } from 'unstorage'
import type { Redis, RedisOptions } from 'ioredis'

/**
 * Move the `cache` and `cache-clear` mounts onto Redis when `runtimeConfig.redisUrl`
 * (NUXT_REDIS_URL) is set; leave the fs mounts from nuxt.config untouched when it is empty (BL-1112).
 *
 * Nitro bakes `storage` into the build, so the choice has to be made here at startup for one
 * image to serve both: dev and a local prod build stay on fs, the stack gets Redis, and a
 * rollback is unsetting the env var. `00.1.` runs after the build-info line and before the other
 * server/plugins (Nitro orders scanned plugins by path.localeCompare; module plugins run earlier
 * but only @nuxtjs/i18n's startup purge of its own handler cache touches `cache`). The swap is
 * synchronous because Nitro does not await plugins, so no request can reach the fs mount first.
 */

/** Keys land as `head:<key>`, e.g. `head:menus:menus-index:bl2:be:en.json`. */
export const CACHE_KEY_BASE = 'head'
/**
 * Marker keys land as `head:cache-clear:<key>`. As on fs (where the markers directory sits
 * inside the cache directory) a `cache` getKeys() also lists them as `cache-clear:*`;
 * clearSiteCache only ever matches SITE_SCOPED_CACHE_GROUPS, so it never touches them.
 */
export const CACHE_CLEAR_KEY_BASE = 'head:cache-clear'

const ERROR_LOG_INTERVAL_MS = 60_000

/**
 * A request must never wait on Redis. The offline queue is on only until the first connect
 * outcome (see failFastAfterFirstConnect), so boot-time reads such as the thesaurus warm-up
 * wait the few ms for the socket instead of missing; after that a command issued while
 * disconnected fails at once (a cache miss) instead of queueing until reconnect.
 * commandTimeout bounds a connected-but-stalled server and any command still queued at boot.
 * Reconnects keep going, capped at 5s apart, so the cache comes back on its own when Redis does.
 */
export const REDIS_CLIENT_OPTIONS: RedisOptions = {
  enableOfflineQueue: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2_000,
  commandTimeout: 1_000,
  retryStrategy: (times: number) => Math.min(times * 500, 5_000),
}

export type CacheErrorLogger = (operation: string, error: unknown) => void

/** Mask credentials so the startup line can say where the cache lives without leaking them. */
export function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username) parsed.username = '***'
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '<unparseable redis url>'
  }
}

/** ECONNREFUSED arrives as an AggregateError with an empty message; fall back to its code. */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message || (error as NodeJS.ErrnoException).code || error.name : String(error)

/**
 * One error line per interval, however many keys or reconnect attempts fail inside it: a
 * down Redis would otherwise log once per cache read on every request.
 */
export function createThrottledErrorLogger(intervalMs = ERROR_LOG_INTERVAL_MS, now: () => number = Date.now): CacheErrorLogger {
  let lastLoggedAt = Number.NEGATIVE_INFINITY

  return (operation, error) => {
    const at = now()
    if (at - lastLoggedAt < intervalMs) return
    lastLoggedAt = at
    console.error(`[cache] Redis ${operation} failed (repeats suppressed for ${intervalMs / 1000}s):`, describeError(error))
  }
}

/**
 * Reads and writes degrade to a miss / a skipped write when Redis is unreachable, so the
 * caller fetches upstream instead of failing. Nitro's cached functions already catch storage
 * errors but log each one; direct callers (sitemaps, the cache-clear markers) do not catch.
 * getKeys, removeItem and clear still throw: a clear that silently did nothing must not be
 * reported as done.
 */
export function degradeOnError(driver: Driver, logError: CacheErrorLogger): Driver {
  const soft = <T>(operation: string, fallback: (...args: any[]) => T, run: (...args: any[]) => Promise<T>) =>
    async (...args: any[]): Promise<T> => {
      try {
        return await run(...args)
      } catch (error) {
        logError(operation, error)
        return fallback(...args)
      }
    }

  return {
    ...driver,
    hasItem: soft('read', () => false, (key, opts) => Promise.resolve(driver.hasItem(key, opts))),
    getItem: soft('read', () => null, (key, opts) => Promise.resolve(driver.getItem(key, opts))),
    getItems: soft(
      'read',
      (items: { key: string }[]) => items.map(({ key }) => ({ key, value: null })),
      (items, opts) => Promise.resolve(driver.getItems!(items, opts)),
    ),
    setItem: soft('write', () => undefined, (key, value, opts) => Promise.resolve(driver.setItem?.(key, value, opts))),
  }
}

/** Stop queueing once the client has either connected or failed to: from then on, fail fast. */
export function failFastAfterFirstConnect(client: Redis): void {
  const disableQueue = () => { client.options.enableOfflineQueue = false }
  client.once('ready', disableQueue)
  client.once('error', disableQueue)
}

/** Swap `cache` and `cache-clear` onto Redis. Synchronous on purpose, see the file header. */
export function mountRedisCache(storage: Storage, redisUrl: string, logError: CacheErrorLogger = createThrottledErrorLogger()): void {
  const mounts: [mountpoint: string, base: string][] = [['cache', CACHE_KEY_BASE], ['cache-clear', CACHE_CLEAR_KEY_BASE]]

  for (const [mountpoint, base] of mounts) {
    const driver = redisDriver({ url: redisUrl, base, preConnect: true, ...REDIS_CLIENT_OPTIONS })
    const client = driver.getInstance!() as Redis
    // An ioredis client without an 'error' listener prints every failed reconnect.
    client.on('error', (error) => logError('connection', error))
    failFastAfterFirstConnect(client)
    // No dispose: the fs driver holds nothing to release, and disposing awaits, which would
    // leave the mount point empty for a tick.
    void storage.unmount(mountpoint, false)
    storage.mount(mountpoint, degradeOnError(driver, logError))
  }
}

export default defineNitroPlugin(() => {
  const { redisUrl } = useRuntimeConfig()

  if (!redisUrl) {
    console.info('[startup] cache storage: fs (NUXT_REDIS_URL not set)')
    return
  }

  mountRedisCache(useStorage(), redisUrl)
  console.info(`[startup] cache storage: redis ${redactRedisUrl(redisUrl)} (keys under ${CACHE_KEY_BASE}:)`)
})
