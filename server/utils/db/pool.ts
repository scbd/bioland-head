/**
 * Shared MariaDB connection pool accessor.
 *
 * Extracted from `server/utils/translate/index.js` so every MariaDB consumer
 * (translation cache today; the config registry from p02-01 onward) shares one
 * pool instance instead of each reaching into the translation module.
 *
 * @module server/utils/db/pool
 */
import mariadb from 'mariadb'

/** @type {import('mariadb').Pool|null} MariaDB connection pool singleton */
let dbPool: import('mariadb').Pool | null = null

/**
 * Resolve the DB half of the runtime config, with defaults.
 * Reads `i18nDbHost`, `i18nDbPort`, `i18nDbUser`, `i18nDbPassword`, `i18nDbName`
 * (default `i18n_cache`), and `i18nDbConnectionLimit` (default `5`) from
 * `useRuntimeConfig()`.
 */
export function getDbConfig() {
  const config = useRuntimeConfig()
  return {
    dbHost: config.i18nDbHost,
    dbPort: config.i18nDbPort || 3306,
    dbUser: config.i18nDbUser,
    dbPassword: config.i18nDbPassword,
    dbName: config.i18nDbName || 'i18n_cache',
    dbConnectionLimit: config.i18nDbConnectionLimit || 5,
  }
}

/**
 * Get the shared MariaDB connection pool (singleton).
 *
 * The pool is created once from `useRuntimeConfig()` and reused across calls;
 * it reads `i18nDbConnectionLimit` (default 5), shared with the translation
 * cache workload since the two share this pool. Call `closeDbPool()` to tear
 * it down and force the next call to build a fresh pool.
 *
 * @returns {import('mariadb').Pool}
 */
export function getDbPool(): import('mariadb').Pool {
  if (!dbPool) {
    const { dbHost, dbPort, dbUser, dbPassword, dbName, dbConnectionLimit } = getDbConfig()

    dbPool = mariadb.createPool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      connectionLimit: dbConnectionLimit,
      acquireTimeout: 30000,
      initializationTimeout: 30000,
      // mariadb defaults this to true, which appends `- parameters:['<value>']`
      // (the first `debugLen` 256 characters of each bound value) to every
      // SqlError message. Both consumers bind content as parameters — the
      // translation cache binds source text, the config registry binds a whole
      // serialised settings document — so a deadlock or a packet-too-large would
      // write that content into any log that prints the error. Off, pool-wide.
      logParam: false,
    })
  }
  return dbPool
}

/**
 * Close the shared MariaDB connection pool and clear the singleton.
 * Call this when shutting down the application. The next `getDbPool()` call
 * after this builds a fresh pool.
 *
 * @returns {Promise<void>}
 */
export async function closeDbPool(): Promise<void> {
  if (dbPool) {
    await dbPool.end()
    dbPool = null
  }
}
