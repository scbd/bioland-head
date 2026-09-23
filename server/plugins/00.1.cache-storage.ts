import redisDriver from 'unstorage/drivers/redis'
import { prefixStorage, type Driver, type Storage } from 'unstorage'
import type { Redis, RedisOptions } from 'ioredis'
import { CACHE_TTL } from '#shared/utils/constants'

/**
 * Move the `cache` and `cache-clear` mounts onto Redis when `runtimeConfig.redisUrl`
 * (NUXT_REDIS_URL) is set; leave the fs mounts from nuxt.config untouched when it is empty (BL-1112).
 *
 * Nitro bakes `storage` into the build, so the choice has to be made here at startup for one
 * image to serve both: dev and a local prod build stay on fs, the stack gets Redis, and a
 * rollback is unsetting the env var. `00.1.` runs after the build-info line and before the other
 * server/plugins (Nitro orders scanned plugins by path.localeCompare). The swap is synchronous
 * because Nitro does not await plugins, so no request can reach the fs mount first.
 *
 * Module plugins run earlier, and @nuxtjs/i18n's startup purge of its handler cache
 * (`nitro:handlers:i18n`) is one of them: it lists the fs mount, so on Redis it removes nothing.
 * mountRedisCache repeats that purge on the Redis mount (see purgeI18nHandlerCache).
 */

/** Keys land as `head:<key>`, e.g. `head:menus:menus-index:bl2:be:en.json`. */
export const CACHE_KEY_BASE = 'head'
/**
 * Marker keys land as `head:cache-clear:<key>`. As on fs (where the markers directory sits
 * inside the cache directory) a `cache` getKeys() also lists them as `cache-clear:*`;
 * clearSiteCache only ever matches SITE_SCOPED_CACHE_GROUPS, so it never touches them.
 */
export const CACHE_CLEAR_KEY_BASE = 'head:cache-clear'

/**
 * Expiry for writes that carry no TTL of their own. Nitro passes `ttl: maxAge` only when
 * `swr` is off, so every SWR entry would otherwise live until LRU eviction. A refresh rewrites
 * the key and restarts the clock, so this only reaps abandoned keys. It sits above the longest
 * SWR maxAge in use (CACHE_TTL.ONE_MONTH) so such an entry can still be served stale once while
 * it refreshes. A per-call ttl (non-SWR entries, explicit setItem ttl) still wins.
 */
export const REDIS_DEFAULT_TTL = CACHE_TTL.ONE_MONTH * 2

/** SCAN batch size for getKeys/clear; Redis' default of 10 means one round trip per 10 keys. */
export const REDIS_SCAN_COUNT = 1000

/** Handler cache @nuxtjs/i18n purges at startup, relative to the `cache` mount. */
export const I18N_HANDLER_CACHE_BASE = 'nitro:handlers:i18n'

const ERROR_LOG_INTERVAL_MS = 60_000
const CIRCUIT_OPEN_MS = 5_000
/** Bounds the once-per-message memory should messages ever carry per-key detail. */
const MAX_DISTINCT_ERRORS = 100

/**
 * A request must never wait on Redis. The offline queue is on only until the first connect
 * outcome (see failFastAfterFirstConnect), so boot-time reads such as the thesaurus warm-up
 * wait the few ms for the socket instead of missing; after that a command issued while
 * disconnected fails at once (a cache miss) instead of queueing until reconnect.
 * commandTimeout bounds a connected-but-stalled server and any command still queued at boot.
 * A half-open socket (peer gone, status still `ready`) is caught by socketTimeout, which drops
 * the socket when a write gets no reply, and by TCP keepalive probes on an idle one; the
 * circuit breaker in degradeOnError keeps requests off it in the meantime.
 * Reconnects keep going, capped at 5s apart, so the cache comes back on its own when Redis does.
 */
export const REDIS_CLIENT_OPTIONS: RedisOptions = {
  enableOfflineQueue: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2_000,
  commandTimeout: 1_000,
  socketTimeout: 2_000,
  keepAlive: 10_000,
  retryStrategy: (times: number) => Math.min(times * 500, 5_000),
}

export interface CacheLogger {
  error(operation: string, error: unknown): void
  /** Called on every `ready`; logs only when it ends an outage. */
  recovered(): void
}

/** Output only protocol//host:port/db: credentials are masked, query and fragment dropped. */
export function redactRedisUrl(url: string): string {
  try {
    const { protocol, username, password, host, pathname } = new URL(url)
    const auth = username || password ? `${username ? '***' : ''}${password ? ':***' : ''}@` : ''
    return `${protocol}//${auth}${host}${pathname}`
  } catch {
    return '<unparseable redis url>'
  }
}

/** ECONNREFUSED arrives as an AggregateError with an empty message; fall back to its code. */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message || (error as NodeJS.ErrnoException).code || error.name : String(error)

const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'])
const CONNECTION_ERROR_MESSAGES = ["Stream isn't writeable", 'Command timed out', 'Connection is closed', 'Socket timeout']

/** True for failures that mean Redis is unreachable or stalled, as opposed to a bad command. */
export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'MaxRetriesPerRequestError') return true
  if (CONNECTION_ERROR_CODES.has((error as NodeJS.ErrnoException).code ?? '')) return true
  if (CONNECTION_ERROR_MESSAGES.some((message) => error.message.includes(message))) return true
  return error instanceof AggregateError && error.errors.some(isConnectionError)
}

/**
 * Connection-class errors log one line per interval, however many keys or reconnect attempts
 * fail inside it: a down Redis would otherwise log once per cache read on every request.
 * Any other error logs once per distinct message. A `ready` after an outage logs the recovery
 * and re-arms the throttle so the next outage is reported at once.
 */
export function createCacheLogger(intervalMs = ERROR_LOG_INTERVAL_MS, now: () => number = () => Date.now()): CacheLogger {
  let lastLoggedAt = Number.NEGATIVE_INFINITY
  let inOutage = false
  const seen = new Set<string>()

  return {
    error(operation, error) {
      const message = describeError(error)
      if (!isConnectionError(error)) {
        if (seen.has(message)) return
        if (seen.size >= MAX_DISTINCT_ERRORS) seen.clear()
        seen.add(message)
        console.error(`[cache] Redis ${operation} failed (logged once per message):`, message)
        return
      }
      inOutage = true
      const at = now()
      if (at - lastLoggedAt < intervalMs) return
      lastLoggedAt = at
      console.error(`[cache] Redis ${operation} failed (repeats suppressed for ${intervalMs / 1000}s):`, message)
    },
    recovered() {
      if (!inOutage) return
      inOutage = false
      lastLoggedAt = Number.NEGATIVE_INFINITY
      console.info('[cache] Redis connection restored')
    },
  }
}

export interface CircuitBreaker {
  isOpen(): boolean
  trip(): void
  reset(): void
}

export function createCircuitBreaker(openMs = CIRCUIT_OPEN_MS, now: () => number = () => Date.now()): CircuitBreaker {
  let openUntil = Number.NEGATIVE_INFINITY
  return {
    isOpen: () => now() < openUntil,
    trip: () => { openUntil = now() + openMs },
    reset: () => { openUntil = Number.NEGATIVE_INFINITY },
  }
}

/**
 * Reads and writes degrade to a miss / a skipped write when Redis is unreachable, so the
 * caller fetches upstream instead of failing. Nitro's cached functions already catch storage
 * errors but log each one; direct callers (sitemaps, the cache-clear markers) do not catch.
 * After a connection-class failure the breaker opens: reads and writes skip Redis entirely for
 * a few seconds, so a stalled server costs one commandTimeout, not one per cache read.
 * getKeys, removeItem and clear still throw: a clear that silently did nothing must not be
 * reported as done.
 */
export function degradeOnError(driver: Driver, logger: CacheLogger, breaker: CircuitBreaker = createCircuitBreaker()): Driver {
  const soft = <T>(operation: string, fallback: (...args: any[]) => T, run: (...args: any[]) => Promise<T>) =>
    async (...args: any[]): Promise<T> => {
      if (breaker.isOpen()) return fallback(...args)
      try {
        return await run(...args)
      } catch (error) {
        if (isConnectionError(error)) breaker.trip()
        logger.error(operation, error)
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

/**
 * Fire-and-forget: redo @nuxtjs/i18n's startup purge, which ran against the fs mount. Same
 * getKeys + removeItem shape as i18n's: storage.clear() on a sub-base never reaches the parent
 * `cache` mount.
 */
export function purgeI18nHandlerCache(storage: Storage, logger: CacheLogger): void {
  const cache = prefixStorage(storage, 'cache')
  cache.getKeys(I18N_HANDLER_CACHE_BASE)
    .then((keys) => Promise.all(keys.map((key) => cache.removeItem(key))))
    .catch((error: unknown) => logger.error('i18n handler cache purge', error))
}

/**
 * Swap `cache` and `cache-clear` onto Redis. Synchronous on purpose, see the file header.
 * Returns the ioredis clients so the caller can close them on shutdown.
 */
export function mountRedisCache(storage: Storage, redisUrl: string, logger: CacheLogger = createCacheLogger()): Redis[] {
  const mounts: [mountpoint: string, base: string][] = [['cache', CACHE_KEY_BASE], ['cache-clear', CACHE_CLEAR_KEY_BASE]]

  const clients = mounts.map(([mountpoint, base]) => {
    const driver = redisDriver({
      url: redisUrl,
      base,
      preConnect: true,
      ttl: REDIS_DEFAULT_TTL,
      scanCount: REDIS_SCAN_COUNT,
      ...REDIS_CLIENT_OPTIONS,
    })
    const client = driver.getInstance!() as Redis
    const breaker = createCircuitBreaker()
    // An ioredis client without an 'error' listener prints every failed reconnect.
    client.on('error', (error) => logger.error('connection', error))
    client.on('ready', () => {
      breaker.reset()
      logger.recovered()
    })
    failFastAfterFirstConnect(client)
    // No dispose: the fs driver holds nothing to release, and disposing awaits, which would
    // leave the mount point empty for a tick.
    void storage.unmount(mountpoint, false)
    storage.mount(mountpoint, degradeOnError(driver, logger, breaker))
    return client
  })

  purgeI18nHandlerCache(storage, logger)
  return clients
}

/** quit() flushes pending replies; a client that is already down cannot, so just drop it. */
export async function closeRedisClients(clients: Redis[]): Promise<void> {
  await Promise.all(clients.map((client) => client.quit().catch(() => client.disconnect())))
}

export default defineNitroPlugin((nitroApp) => {
  const { redisUrl } = useRuntimeConfig()

  if (!redisUrl) {
    console.info('[startup] cache storage: fs (NUXT_REDIS_URL not set)')
    return
  }

  const clients = mountRedisCache(useStorage(), redisUrl)
  nitroApp.hooks.hook('close', () => closeRedisClients(clients))
  console.info(`[startup] cache storage: redis ${redactRedisUrl(redisUrl)} (keys under ${CACHE_KEY_BASE}:)`)
})
