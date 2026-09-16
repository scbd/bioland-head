import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Plain Vitest (`environment: 'node'`) with `vi.stubGlobal` for the Nitro auto-imports, matching
 * `tests/unit/server/utils/thesaurus/resolve-terms.test.ts` and `seed-translation-cache.test.ts`. There
 * is no `@nuxt/test-utils` runtime harness in this repo.
 *
 * Most specs inject every MariaDB/filesystem call through `hydrateI18nCache`'s own `deps` seam — no real
 * database or real `identifier-labels.json` file is ever touched. One spec ("the lock's connection is the
 * one that releases it") deliberately does NOT override `acquireLockFn`/`releaseLockFn`/`getPageFn`, so it
 * exercises the REAL `acquireHydrationLock`/`releaseHydrationLock`/`getCachedTranslationsPage` from
 * `server/utils/translate/index.js` against a mocked `mariadb` pool — this is the one test that would fail
 * if a future refactor "simplified" the lock functions back to the per-call release idiom (the exact trap
 * the war-game and task Step 3 both call out).
 */
vi.mock('mariadb', () => ({ default: { createPool: () => fakePool } }))

/** Backs the real (non-injected) `readIdentifierLabelMap`'s `fs.promises.readFile` call. */
const readFileMock = vi.fn()
vi.mock('node:fs', () => ({ promises: { readFile: (...args: unknown[]) => readFileMock(...args) } }))

/** Every connection the fake pool has ever handed out, in acquisition order. */
const createdConnections: Array<{ id: number; query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> = []

function makeFakeConnection(id: number) {
  return {
    id,
    query: vi.fn(async (sql: string) => {
      if (sql.includes('GET_LOCK')) return [{ locked: 1 }]
      if (sql.includes('RELEASE_LOCK')) return [{ 'RELEASE_LOCK(?)': 1 }]
      return [] // i18n_cache page reads: empty table is a valid, harmless boot state
    }),
    release: vi.fn()
  }
}

const fakePool = {
  getConnection: vi.fn(async () => {
    const connection = makeFakeConnection(createdConnections.length)
    createdConnections.push(connection)
    return connection
  })
}

vi.stubGlobal('useRuntimeConfig', () => ({
  hydrateI18nCache: true,
  i18nDbHost: 'db', i18nDbPort: 3306, i18nDbUser: 'u', i18nDbPassword: 'p',
  i18nDbName: 'i18n_cache', i18nDbConnectionLimit: 5
}))

const { hydrateI18nCache } = await import('~/server/utils/thesaurus/hydrate-i18n-cache')
const { LABEL_CACHE_VERSION, buildLabelKey } = await import('~/server/utils/thesaurus/resolve-terms')

/** In-memory `useStorage('thesaurus')` stand-in with the two methods this function calls. */
function makeStorage(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed))
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
    })
  }
}

/** A held "connection" object identity-trackable across acquire/release. */
function makeConnection() {
  return { id: Symbol('connection') }
}

const IDENTIFIER_MAP = { 'ID-A': 'Alpha', 'ID-B': 'Beta' }

function makeDeps(overrides: Record<string, unknown> = {}) {
  const storage = makeStorage()
  const logger = { debug: vi.fn(), success: vi.fn(), warn: vi.fn() }
  return {
    runtimeConfig: { hydrateI18nCache: true },
    storage,
    logger,
    isDev: false,
    acquireLockFn: vi.fn(async () => ({ locked: true, connection: makeConnection() })),
    releaseLockFn: vi.fn(async () => {}),
    getPageFn: vi.fn(async () => []),
    readIdentifierLabels: vi.fn(async () => ({ ...IDENTIFIER_MAP })),
    now: 1_700_000_000_000,
    ...overrides
  }
}

const markerKey = () => `hydration-marker:${LABEL_CACHE_VERSION}`

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => vi.stubGlobal('useRuntimeConfig', () => ({ hydrateI18nCache: true })))

describe('hydrateI18nCache', () => {
  it('winner hydrates and writes the version-scoped marker', async () => {
    const rows = [
      { source_locale: 'en', target_locale: 'fr', cache_key: 'Alpha', translation_value: 'Alpha (fr)' },
      { source_locale: 'en', target_locale: 'es', cache_key: 'Beta', translation_value: 'Beta (es)' }
    ]
    const deps = makeDeps({ getPageFn: vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]) })

    await hydrateI18nCache(deps)

    expect(deps.storage.setItem).toHaveBeenCalledWith(
      buildLabelKey('tr', 'ID-A', 'fr'),
      expect.objectContaining({ value: 'Alpha (fr)', source: 'translation' })
    )
    expect(deps.storage.setItem).toHaveBeenCalledWith(
      buildLabelKey('tr', 'ID-B', 'es'),
      expect.objectContaining({ value: 'Beta (es)', source: 'translation' })
    )
    const marker = deps.storage.store.get(markerKey()) as { rowsRead: number; entriesWritten: number }
    expect(marker.rowsRead).toBe(2)
    expect(marker.entriesWritten).toBe(2)
  })

  it('a second instance sees the marker and skips without querying', async () => {
    const deps = makeDeps({ storage: makeStorage({ [markerKey()]: { hydratedAt: 1, rowsRead: 1, entriesWritten: 1 } }) })

    await hydrateI18nCache(deps)

    expect(deps.acquireLockFn).not.toHaveBeenCalled()
    expect(deps.getPageFn).not.toHaveBeenCalled()
  })

  it('lock acquisition failure skips without hydrating', async () => {
    const deps = makeDeps({ acquireLockFn: vi.fn(async () => ({ locked: false })) })

    await hydrateI18nCache(deps)

    expect(deps.getPageFn).not.toHaveBeenCalled()
    expect(deps.storage.setItem).not.toHaveBeenCalled()
    expect(deps.storage.store.has(markerKey())).toBe(false)
  })

  it('DB unreachable logs and does not throw', async () => {
    const deps = makeDeps({ acquireLockFn: vi.fn(async () => { throw new Error('connect ECONNREFUSED') }) })

    await expect(hydrateI18nCache(deps)).resolves.toBeUndefined()
    expect(deps.logger.warn).toHaveBeenCalled()
  })

  it('a LABEL_CACHE_VERSION bump re-hydrates despite an existing marker for the old version', async () => {
    const staleMarkerKey = `hydration-marker:${LABEL_CACHE_VERSION - 1}`
    const deps = makeDeps({
      storage: makeStorage({ [staleMarkerKey]: { hydratedAt: 1, rowsRead: 1, entriesWritten: 1 } }),
      getPageFn: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
    })

    await hydrateI18nCache(deps)

    expect(deps.acquireLockFn).toHaveBeenCalled()
    expect(deps.storage.store.has(markerKey())).toBe(true)
  })

  it('hydration pages rather than loading all rows', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      source_locale: 'en',
      target_locale: 'fr',
      cache_key: `unmatched-${i}`,
      translation_value: 'x'
    }))
    const getPageFn = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce([])
    const deps = makeDeps({ getPageFn })

    await hydrateI18nCache(deps)

    expect(getPageFn).toHaveBeenCalledTimes(2)
    expect(getPageFn).toHaveBeenNthCalledWith(1, 0, 500)
    expect(getPageFn).toHaveBeenNthCalledWith(2, 500, 500)
  })

  it('the lock is released on both the success path and the throw path', async () => {
    const successDeps = makeDeps({ getPageFn: vi.fn().mockResolvedValueOnce([]) })
    await hydrateI18nCache(successDeps)
    expect(successDeps.releaseLockFn).toHaveBeenCalledTimes(1)

    const fullFirstPage = Array.from({ length: 500 }, (_, i) => ({
      source_locale: 'en',
      target_locale: 'fr',
      cache_key: `unmatched-${i}`,
      translation_value: 'x'
    }))
    const throwDeps = makeDeps({
      getPageFn: vi.fn()
        .mockResolvedValueOnce(fullFirstPage) // exactly HYDRATION_PAGE_SIZE -> loop continues
        .mockRejectedValueOnce(new Error('boom')) // second page throws mid-loop
    })
    await expect(hydrateI18nCache(throwDeps)).resolves.toBeUndefined()
    expect(throwDeps.releaseLockFn).toHaveBeenCalledTimes(1)
    expect(throwDeps.storage.store.has(markerKey())).toBe(false)
  })

  it('is a no-op — logged, not crashed — when p03-01\'s map is absent or stale', async () => {
    const deps = makeDeps({ readIdentifierLabels: vi.fn(async () => null) })

    await hydrateI18nCache(deps)

    expect(deps.getPageFn).not.toHaveBeenCalled()
    expect(deps.storage.setItem).not.toHaveBeenCalled()
    expect(deps.logger.warn).toHaveBeenCalled()

    const parseErrorDeps = makeDeps({ readIdentifierLabels: vi.fn(async () => { throw new Error('bad json') }) })
    await expect(hydrateI18nCache(parseErrorDeps)).resolves.toBeUndefined()
    expect(parseErrorDeps.logger.warn).toHaveBeenCalled()
    expect(parseErrorDeps.storage.setItem).not.toHaveBeenCalled()
  })

  it('is a no-op — logged, not crashed — when p03-01\'s map parses but is empty (Minor 3)', async () => {
    const deps = makeDeps({ readIdentifierLabels: vi.fn(async () => ({})) })

    await hydrateI18nCache(deps)

    expect(deps.getPageFn).not.toHaveBeenCalled()
    expect(deps.storage.setItem).not.toHaveBeenCalled()
    expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('identifier-labels.json'))
  })

  it('a throwing useRuntimeConfig default cannot crash boot (BL-1005 Major 1)', async () => {
    // Regression for a real reported failure mode: `useRuntimeConfig()` throwing (no Nitro request
    // context) previously ran OUTSIDE the function's own try/catch, as part of the destructuring
    // default itself — so the rejection escaped `hydrateI18nCache`'s "never throws" contract, and
    // the unawaited plugin call site (`hydrateI18nCache()`, no `.catch`) surfaced it as an
    // unhandled rejection at boot. Calling with no `deps` at all exercises the real default wiring.
    vi.stubGlobal('useRuntimeConfig', () => {
      throw new Error('no Nitro request context')
    })

    await expect(hydrateI18nCache()).resolves.toBeUndefined()
  })

  it('a throwing useStorage default cannot crash boot (BL-1005 Major 1)', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ hydrateI18nCache: true }))
    vi.stubGlobal('useStorage', () => {
      throw new Error('bad mount config')
    })

    await expect(hydrateI18nCache()).resolves.toBeUndefined()
  })

  it("the lock's connection is the one that releases it (real acquireHydrationLock/releaseHydrationLock)", async () => {
    createdConnections.length = 0
    const deps = makeDeps({})
    delete (deps as Record<string, unknown>).acquireLockFn
    delete (deps as Record<string, unknown>).releaseLockFn
    delete (deps as Record<string, unknown>).getPageFn

    await hydrateI18nCache(deps)

    // The lock connection is acquired first; subsequent page-read connections (if any) are separate.
    const lockConnection = createdConnections[0]
    expect(lockConnection.query).toHaveBeenCalledWith('SELECT GET_LOCK(?, 0) AS locked', ['i18n-cache-hydration'])
    expect(lockConnection.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', ['i18n-cache-hydration'])
    expect(lockConnection.release).toHaveBeenCalledTimes(1)
    // Prove RELEASE_LOCK ran BEFORE the connection went back to the pool, not after.
    const releaseLockCallOrder = lockConnection.query.mock.invocationCallOrder[1]
    const connectionReleaseCallOrder = lockConnection.release.mock.invocationCallOrder[0]
    expect(releaseLockCallOrder).toBeLessThan(connectionReleaseCallOrder)
  })

  it('a throwing GET_LOCK query releases the connection instead of leaking it (BL-1005 Major 2)', async () => {
    // Distinct from the "DB unreachable" spec above, which fails at `pool.getConnection()`. Here
    // the connection is acquired fine and the `GET_LOCK` query itself throws (transient network
    // blip, permission error). Without a try/catch around that query, the connection is neither
    // released nor returned in the thrown error — with I18N_DB_CONNECTION_LIMIT defaulting to 5,
    // repeated failures like this exhaust the pool and take translation down process-wide.
    const { acquireHydrationLock } = await import('~/server/utils/translate/index.js')
    createdConnections.length = 0
    const originalGetConnection = fakePool.getConnection
    fakePool.getConnection = vi.fn(async () => {
      const connection = makeFakeConnection(createdConnections.length)
      connection.query = vi.fn(async (sql: string) => {
        if (sql.includes('GET_LOCK')) throw new Error('ECONNRESET')
        return []
      })
      createdConnections.push(connection)
      return connection
    })

    try {
      await expect(acquireHydrationLock('i18n-cache-hydration')).rejects.toThrow('ECONNRESET')
      expect(createdConnections[0].release).toHaveBeenCalledTimes(1)
    } finally {
      fakePool.getConnection = originalGetConnection
    }
  })

  it('disabled via runtimeConfig.hydrateI18nCache never touches storage or the lock', async () => {
    const deps = makeDeps({ runtimeConfig: { hydrateI18nCache: false } })

    await hydrateI18nCache(deps)

    expect(deps.storage.getItem).not.toHaveBeenCalled()
    expect(deps.acquireLockFn).not.toHaveBeenCalled()
  })

  it('skips in dev mode without touching storage or the lock', async () => {
    const deps = makeDeps({ isDev: true })

    await hydrateI18nCache(deps)

    expect(deps.storage.getItem).not.toHaveBeenCalled()
    expect(deps.acquireLockFn).not.toHaveBeenCalled()
  })

  it('skips rows whose source_locale is not English, and skips unmatched cache_key rows', async () => {
    const rows = [
      { source_locale: 'fr', target_locale: 'en', cache_key: 'Alpha', translation_value: 'should not write' },
      { source_locale: 'en', target_locale: 'fr', cache_key: 'Unrelated text', translation_value: 'should not write either' }
    ]
    const deps = makeDeps({ getPageFn: vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]) })

    await hydrateI18nCache(deps)

    expect(deps.storage.setItem).toHaveBeenCalledTimes(1) // marker only
    expect(deps.storage.setItem).toHaveBeenCalledWith(markerKey(), expect.anything())
  })

  it('skips without hydrating when no thesaurus storage mount is available', async () => {
    const deps = makeDeps({ storage: null })

    await hydrateI18nCache(deps)

    expect(deps.acquireLockFn).not.toHaveBeenCalled()
    expect(deps.logger.warn).toHaveBeenCalled()
  })

  it('re-checks the marker after acquiring the lock (double-checked locking) and skips if now present', async () => {
    const storage = makeStorage()
    // First read (pre-lock): no marker. Second read (post-lock): another container just finished.
    storage.getItem = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ hydratedAt: 1, rowsRead: 1, entriesWritten: 1 })
    const deps = makeDeps({ storage })

    await hydrateI18nCache(deps)

    expect(deps.acquireLockFn).toHaveBeenCalled()
    expect(deps.releaseLockFn).toHaveBeenCalledTimes(1)
    expect(deps.getPageFn).not.toHaveBeenCalled()
    expect(deps.storage.setItem).not.toHaveBeenCalled()
  })

  it('counts and logs truncated-hash cache_key rows without writing an entry for them', async () => {
    const truncatedHash = 'a'.repeat(64)
    const rows = [{ source_locale: 'en', target_locale: 'fr', cache_key: truncatedHash, translation_value: 'x' }]
    const deps = makeDeps({ getPageFn: vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]) })

    await hydrateI18nCache(deps)

    expect(deps.storage.setItem).toHaveBeenCalledTimes(1) // marker only, no label:tr entry for the hash row
    expect(deps.logger.debug).toHaveBeenCalledWith(expect.stringContaining('truncated-hash'))
  })

  it('a shared English label writes every identifier it maps to', async () => {
    const deps = makeDeps({
      readIdentifierLabels: vi.fn(async () => ({ 'ID-A': 'Alpha', 'ID-C': 'Alpha' })),
      getPageFn: vi
        .fn()
        .mockResolvedValueOnce([{ source_locale: 'en', target_locale: 'fr', cache_key: 'Alpha', translation_value: 'Alpha (fr)' }])
        .mockResolvedValueOnce([])
    })

    await hydrateI18nCache(deps)

    expect(deps.storage.setItem).toHaveBeenCalledWith(buildLabelKey('tr', 'ID-A', 'fr'), expect.anything())
    expect(deps.storage.setItem).toHaveBeenCalledWith(buildLabelKey('tr', 'ID-C', 'fr'), expect.anything())
  })

  it('reads and parses the real committed identifier-labels.json via readIdentifierLabelMap when not overridden', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({ labels: [{ identifier: 'ID-A', label: 'Alpha' }] }))
    const deps = makeDeps({})
    delete (deps as Record<string, unknown>).readIdentifierLabels
    deps.getPageFn = vi
      .fn()
      .mockResolvedValueOnce([{ source_locale: 'en', target_locale: 'fr', cache_key: 'Alpha', translation_value: 'Alpha (fr)' }])
      .mockResolvedValueOnce([])

    await hydrateI18nCache(deps)

    expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('identifier-labels.json'), 'utf8')
    expect(deps.storage.setItem).toHaveBeenCalledWith(buildLabelKey('tr', 'ID-A', 'fr'), expect.anything())
  })

  it('treats an unreadable/unparseable committed identifier-labels.json as absent (abort, no crash)', async () => {
    readFileMock.mockRejectedValueOnce(new Error('ENOENT: no such file'))
    const deps = makeDeps({})
    delete (deps as Record<string, unknown>).readIdentifierLabels

    await expect(hydrateI18nCache(deps)).resolves.toBeUndefined()

    expect(deps.getPageFn).not.toHaveBeenCalled()
    expect(deps.logger.warn).toHaveBeenCalled()
  })
})
