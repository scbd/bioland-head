import { describe, it, expect, vi, beforeEach } from 'vitest'

// The summary reads and writes go over the shared pool from server/utils/db/pool.ts.
// That module is stubbed here so everything can be exercised without a Nitro
// context or a real database. Fixtures are synthetic throughout, and the one
// token-shaped fixture is an obviously-fake dummy.

const dbQuery = vi.fn()
const beginTransaction = vi.fn().mockResolvedValue(undefined)
const commit = vi.fn().mockResolvedValue(undefined)
const rollback = vi.fn().mockResolvedValue(undefined)
const release = vi.fn().mockResolvedValue(undefined)
const getConnection = vi.fn()

vi.mock('../../../../../server/utils/db/pool', () => ({
  getDbPool: () => ({ getConnection }),
}))

const runtimeConfig = { public: { env: 'dev', multiSiteCode: 'bl2', baseHost: 'cbddev.xyz' } }
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)

const fetchCalls: { url: string, options: any }[] = []
const fetchImpl = vi.fn(async (url: string, options: any) => {
  fetchCalls.push({ url, options })
  return { ok: true }
})
vi.stubGlobal('$fetch', fetchImpl)

const mod = await import('../../../../../server/utils/site-registry/network-summary')
const {
  NETWORK_SUMMARY_TABLE,
  NETWORK_SUMMARY_TOKEN_HEADER,
  NetworkSummaryInvalidError,
  buildNetworkSummary,
  parseNetworkSummaryPayload,
  pushNetworkSummary,
  readNetworkSummary,
  resolveNetworkSummaryScope,
  scopeAllowsSlice,
  writeNetworkSummary,
} = mod

const { RegistryUnavailableError } = await import('../../../../../server/utils/site-registry/types')

/** Obviously-fake dummy secrets. Never a real value. */
const DEV_SECRET = 'dummy-dev-not-a-real-token'
const PROD_SECRET = 'dummy-prod-not-a-real-token'
const CONFIGURED = `dev:${DEV_SECRET},prod/bl2:${PROD_SECRET}`

function driverReturns(...results: unknown[]) {
  dbQuery.mockReset()
  for (const result of results) dbQuery.mockResolvedValueOnce(result)
  dbQuery.mockResolvedValue([])
}

/** A valid five-field payload as a pushing deployment would send it. */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    env: 'dev',
    multiSiteCode: 'bl2',
    baseHost: 'cbddev.xyz',
    sites: [
      { siteCode: 'be', name: 'Belgium CHM', scbd: false, published: true },
      { siteCode: 'seed', name: null, scbd: true, published: false },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchCalls.length = 0
  delete process.env.NUXT_NETWORK_SUMMARY_TARGET_URL
  delete process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN
  runtimeConfig.public = { env: 'dev', multiSiteCode: 'bl2', baseHost: 'cbddev.xyz' }
  getConnection.mockResolvedValue({
    query: dbQuery, beginTransaction, commit, rollback, release,
  })
  driverReturns()
})

describe('the published field set', () => {
  it('publishes exactly the five allowed fields and nothing more', async () => {
    driverReturns([
      {
        site_code: 'be',
        name: 'Belgium CHM',
        scbd: 0,
        published: 1,
        // Columns a wider SELECT could have carried. If any of these ever reach
        // the summary, this test fails — the row shape is a security boundary.
        host: 'be.cbddev.xyz',
        description: 'should never be published',
        has_bl1: 'true',
      },
    ])

    const summary = await buildNetworkSummary('dev', 'bl2')

    expect(Object.keys(summary).sort()).toEqual(['baseHost', 'env', 'multiSiteCode', 'sites'])
    expect(summary.sites).toHaveLength(1)
    expect(Object.keys(summary.sites[0]).sort()).toEqual(['name', 'published', 'scbd', 'siteCode'])
    expect(summary.sites[0]).toEqual({
      siteCode: 'be', name: 'Belgium CHM', scbd: false, published: true,
    })
    expect(summary.baseHost).toBe('cbddev.xyz')
  })

  it('selects only the four projected columns from site_config', async () => {
    driverReturns([])
    await buildNetworkSummary('dev', 'bl2')

    const sql = String(dbQuery.mock.calls[0][0])
    expect(sql).toMatch(/SELECT site_code, name, scbd, published/)
    expect(sql).not.toMatch(/\bhost\b|description|has_bl1|theme|settings/)
    expect(dbQuery.mock.calls[0][1]).toEqual(['dev', 'bl2'])
  })

  it('treats an empty slice as a legitimate answer, not a failure', async () => {
    driverReturns([])
    await expect(buildNetworkSummary('dev', 'bl2')).resolves.toMatchObject({ sites: [] })
  })

  it('reports a missing baseHost as null rather than an empty string', async () => {
    runtimeConfig.public = { env: 'dev', multiSiteCode: 'bl2', baseHost: '' }
    driverReturns([])
    await expect(buildNetworkSummary('dev', 'bl2')).resolves.toMatchObject({ baseHost: null })
  })

  it('wraps a driver failure so a SqlError message cannot propagate', async () => {
    dbQuery.mockReset()
    dbQuery.mockRejectedValueOnce(new Error('SqlError: ... password=dummy-not-real'))

    const error = await buildNetworkSummary('dev', 'bl2').catch((e: unknown) => e) as Error
    expect(error).toBeInstanceOf(RegistryUnavailableError)
    expect(error.message).not.toContain('password')
    expect(release).toHaveBeenCalled()
  })
})

describe('ingest validation', () => {
  it('accepts a well-formed payload', () => {
    expect(parseNetworkSummaryPayload(validPayload())).toEqual(validPayload())
  })

  it.each([
    ['a non-object body', 'not an object'],
    ['an array body', [{ env: 'dev' }]],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(() => parseNetworkSummaryPayload(body)).toThrow(NetworkSummaryInvalidError)
  })

  it('rejects an extra top-level key rather than dropping it', () => {
    expect(() => parseNetworkSummaryPayload(validPayload({ dataBase: 'mysql://u:p@h/db' })))
      .toThrow(/body\.dataBase — unexpected key/)
  })

  it('rejects an extra per-site key rather than dropping it', () => {
    const payload = validPayload()
    ;(payload.sites[0] as Record<string, unknown>).panoramaKey = 'dummy-not-real'

    expect(() => parseNetworkSummaryPayload(payload)).toThrow(/sites\[0\]\.panoramaKey — unexpected key/)
  })

  it.each([
    ['a non-string env', { env: 7 }],
    ['an unknown env', { env: 'qa' }],
    ['a non-string multiSiteCode', { multiSiteCode: true }],
    ['a multiSiteCode with disallowed characters', { multiSiteCode: 'bl2; DROP TABLE' }],
    ['a baseHost with disallowed characters', { baseHost: 'https://evil.test/path' }],
    ['a non-array sites', { sites: { be: {} } }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseNetworkSummaryPayload(validPayload(overrides))).toThrow(NetworkSummaryInvalidError)
  })

  it.each([
    ['a non-string siteCode', { siteCode: 12 }],
    ['a siteCode with disallowed characters', { siteCode: '../../etc' }],
    ['a non-boolean scbd', { scbd: 'true' }],
    ['a non-boolean published', { published: 1 }],
    ['a non-string, non-null name', { name: { en: 'Belgium' } }],
  ])('rejects %s', (_label, overrides) => {
    const payload = validPayload({ sites: [{ siteCode: 'be', name: 'Belgium', scbd: false, published: true, ...overrides }] })
    expect(() => parseNetworkSummaryPayload(payload)).toThrow(NetworkSummaryInvalidError)
  })

  it('allows a null name, the one nullable field', () => {
    const payload = validPayload({ sites: [{ siteCode: 'be', name: null, scbd: false, published: true }] })
    expect(parseNetworkSummaryPayload(payload).sites[0].name).toBeNull()
  })

  it('allows a null baseHost', () => {
    expect(parseNetworkSummaryPayload(validPayload({ baseHost: null })).baseHost).toBeNull()
  })

  it('bounds string length to the column width', () => {
    const long = 'a'.repeat(256)
    expect(() => parseNetworkSummaryPayload(validPayload({
      sites: [{ siteCode: 'be', name: long, scbd: false, published: true }],
    }))).toThrow(/exceeds 255 characters/)
    expect(() => parseNetworkSummaryPayload(validPayload({ baseHost: `${long}.test` })))
      .toThrow(NetworkSummaryInvalidError)
  })

  it('caps the slice size', () => {
    const sites = Array.from({ length: 2001 }, (_, i) => ({
      siteCode: `s${i}`, name: null, scbd: false, published: true,
    }))
    expect(() => parseNetworkSummaryPayload(validPayload({ sites }))).toThrow(/exceeds 2000 entries/)
  })

  it('rejects a duplicate site code', () => {
    const site = { siteCode: 'be', name: 'Belgium', scbd: false, published: true }
    expect(() => parseNetworkSummaryPayload(validPayload({ sites: [site, { ...site }] })))
      .toThrow(/duplicate site code/)
  })

  it('never echoes a rejected value in the error message', () => {
    const secretish = 'mysql://user:dummy-not-real@db.internal/i18n_cache'
    try {
      parseNetworkSummaryPayload(validPayload({ baseHost: secretish }))
      expect.unreachable('should have thrown')
    }
    catch (error) {
      expect((error as Error).message).not.toContain('dummy-not-real')
      expect((error as Error).message).not.toContain('mysql://')
    }
  })
})

describe('token auth', () => {
  it('rejects a missing, empty or wrong token', () => {
    expect(resolveNetworkSummaryScope(CONFIGURED, undefined)).toBeNull()
    expect(resolveNetworkSummaryScope(CONFIGURED, '')).toBeNull()
    expect(resolveNetworkSummaryScope(CONFIGURED, 'dummy-wrong')).toBeNull()
    expect(resolveNetworkSummaryScope(undefined, DEV_SECRET)).toBeNull()
  })

  it('rejects a correct prefix of a valid token', () => {
    expect(resolveNetworkSummaryScope(CONFIGURED, DEV_SECRET.slice(0, -1))).toBeNull()
  })

  it('resolves the scope the matched entry declares', () => {
    expect(resolveNetworkSummaryScope(CONFIGURED, DEV_SECRET)).toEqual({ env: 'dev' })
    expect(resolveNetworkSummaryScope(CONFIGURED, PROD_SECRET)).toEqual({ env: 'prod', multiSiteCode: 'bl2' })
  })

  it('ignores malformed configuration entries', () => {
    expect(resolveNetworkSummaryScope(`no-separator,:${DEV_SECRET},qa:${DEV_SECRET},dev:`, DEV_SECRET)).toBeNull()
    expect(resolveNetworkSummaryScope(` dev:${DEV_SECRET} , junk `, DEV_SECRET)).toEqual({ env: 'dev' })
  })

  it('rejects a scope whose multiSiteCode is malformed', () => {
    expect(resolveNetworkSummaryScope(`dev/bad code:${DEV_SECRET}`, DEV_SECRET)).toBeNull()
  })

  it('stops a pushing deployment writing another deployment\'s slice', () => {
    const devScope = resolveNetworkSummaryScope(CONFIGURED, DEV_SECRET)!

    // The credential, not the payload, decides the slice.
    expect(scopeAllowsSlice(devScope, 'dev', 'bl2')).toBe(true)
    expect(scopeAllowsSlice(devScope, 'dev', 'bsl')).toBe(true)
    expect(scopeAllowsSlice(devScope, 'prod', 'bl2')).toBe(false)
    expect(scopeAllowsSlice(devScope, 'stg', 'bl2')).toBe(false)

    // A multiSiteCode-scoped credential is narrower still.
    const prodScope = resolveNetworkSummaryScope(CONFIGURED, PROD_SECRET)!
    expect(scopeAllowsSlice(prodScope, 'prod', 'bl2')).toBe(true)
    expect(scopeAllowsSlice(prodScope, 'prod', 'bsl')).toBe(false)
  })
})

describe('atomic slice replace', () => {
  it('deletes and inserts one slice inside a single transaction', async () => {
    await writeNetworkSummary(parseNetworkSummaryPayload(validPayload()))

    expect(beginTransaction).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
    expect(rollback).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()

    const [deleteSql, deleteParams] = dbQuery.mock.calls[0]
    expect(String(deleteSql)).toContain(`DELETE FROM ${NETWORK_SUMMARY_TABLE}`)
    expect(String(deleteSql)).toContain('WHERE env = ? AND multi_site_code = ?')
    expect(deleteParams).toEqual(['dev', 'bl2'])
  })

  it('binds the caller\'s slice key on every inserted row', async () => {
    await writeNetworkSummary(parseNetworkSummaryPayload(validPayload()))

    const inserts = dbQuery.mock.calls.slice(1)
    expect(inserts).toHaveLength(2)
    for (const [, params] of inserts) {
      expect((params as unknown[]).slice(0, 2)).toEqual(['dev', 'bl2'])
    }
    expect(inserts[0][1]).toEqual(['dev', 'bl2', 'be', 'Belgium CHM', 0, 1, 'cbddev.xyz'])
    expect(inserts[1][1]).toEqual(['dev', 'bl2', 'seed', null, 1, 0, 'cbddev.xyz'])
  })

  it('never interpolates a value into the SQL text', async () => {
    await writeNetworkSummary(parseNetworkSummaryPayload(validPayload()))

    for (const [sql] of dbQuery.mock.calls) {
      expect(String(sql)).not.toContain('Belgium')
      expect(String(sql)).not.toContain('cbddev.xyz')
    }
  })

  it('rolls back and leaves the previous rows intact when a write fails', async () => {
    dbQuery.mockReset()
    dbQuery.mockResolvedValueOnce({ affectedRows: 2 })          // DELETE
    dbQuery.mockRejectedValueOnce(new Error('connection lost'))  // first INSERT

    await expect(writeNetworkSummary(parseNetworkSummaryPayload(validPayload())))
      .rejects.toBeInstanceOf(RegistryUnavailableError)

    expect(rollback).toHaveBeenCalledOnce()
    expect(commit).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it('still surfaces the original failure when the rollback itself fails', async () => {
    dbQuery.mockReset()
    dbQuery.mockRejectedValueOnce(new Error('connection lost'))
    rollback.mockRejectedValueOnce(new Error('rollback failed'))

    await expect(writeNetworkSummary(parseNetworkSummaryPayload(validPayload())))
      .rejects.toBeInstanceOf(RegistryUnavailableError)
  })

  it('writes nothing at all for an empty slice beyond the delete', async () => {
    await writeNetworkSummary(parseNetworkSummaryPayload(validPayload({ sites: [] })))
    expect(dbQuery).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
  })
})

describe('reading this deployment\'s own store', () => {
  it('groups rows into slices and exposes the newest updated_at per slice', async () => {
    driverReturns([
      { env: 'dev', multi_site_code: 'bl2', site_code: 'be', name: 'Belgium', scbd: 0, published: 1, base_host: 'cbddev.xyz', updated_at: new Date('2026-09-01T10:00:00Z') },
      { env: 'dev', multi_site_code: 'bl2', site_code: 'gt', name: null, scbd: 0, published: 0, base_host: 'cbddev.xyz', updated_at: new Date('2026-09-01T12:00:00Z') },
      { env: 'prod', multi_site_code: 'bl2', site_code: 'be', name: 'Belgium', scbd: 1, published: 1, base_host: 'cbd.int', updated_at: new Date('2026-09-02T09:00:00Z') },
    ])

    const slices = await readNetworkSummary()

    expect(slices).toHaveLength(2)
    expect(slices[0].env).toBe('dev')
    expect(slices[0].sites.map(s => s.siteCode)).toEqual(['be', 'gt'])
    expect(slices[0].updatedAt).toBe('2026-09-01T12:00:00.000Z')
    expect(slices[1]).toMatchObject({ env: 'prod', baseHost: 'cbd.int' })
  })

  it('returns exactly the four site keys plus baseHost and updatedAt', async () => {
    driverReturns([
      { env: 'dev', multi_site_code: 'bl2', site_code: 'be', name: 'Belgium', scbd: 0, published: 1, base_host: 'cbddev.xyz', updated_at: new Date('2026-09-01T10:00:00Z') },
    ])

    const [slice] = await readNetworkSummary()

    expect(Object.keys(slice).sort()).toEqual(['baseHost', 'env', 'multiSiteCode', 'sites', 'updatedAt'])
    expect(Object.keys(slice.sites[0]).sort()).toEqual(['name', 'published', 'scbd', 'siteCode'])
  })

  it('takes no env argument and binds no parameters', async () => {
    driverReturns([])
    await readNetworkSummary()

    expect(readNetworkSummary).toHaveLength(0)
    expect(dbQuery.mock.calls[0][1]).toEqual([])
  })

  it('returns an empty list for a store nothing has been pushed to', async () => {
    driverReturns([])
    await expect(readNetworkSummary()).resolves.toEqual([])
  })

  it('tolerates an unparseable or absent timestamp', async () => {
    driverReturns([
      { env: 'dev', multi_site_code: 'bl2', site_code: 'be', name: null, scbd: null, published: null, base_host: null, updated_at: 'not a date' },
      { env: 'stg', multi_site_code: 'bl2', site_code: 'be', name: null, scbd: 1, published: 1, base_host: null, updated_at: null },
    ])

    const slices = await readNetworkSummary()
    expect(slices[0].updatedAt).toBeNull()
    expect(slices[0].sites[0]).toEqual({ siteCode: 'be', name: null, scbd: false, published: false })
    expect(slices[1].updatedAt).toBeNull()
  })

  it('wraps a driver failure', async () => {
    dbQuery.mockReset()
    dbQuery.mockRejectedValueOnce(new Error('boom'))
    await expect(readNetworkSummary()).rejects.toBeInstanceOf(RegistryUnavailableError)
  })
})

describe('the push', () => {
  it('skips, rather than fails, when the deployment does not publish', async () => {
    await expect(pushNetworkSummary()).resolves.toMatchObject({ status: 'skipped' })
    expect(fetchCalls).toHaveLength(0)

    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://prod.test/api/site-registry/network'
    await expect(pushNetworkSummary()).resolves.toMatchObject({ status: 'skipped' })
  })

  it('skips when the deployment has no public env or multiSiteCode', async () => {
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://prod.test/api/site-registry/network'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `dev:${DEV_SECRET}`
    runtimeConfig.public = { env: '', multiSiteCode: '', baseHost: '' }

    await expect(pushNetworkSummary()).resolves.toMatchObject({ status: 'skipped' })
    expect(fetchCalls).toHaveLength(0)
  })

  it('sends the token in a header and never in the URL or body', async () => {
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://prod.test/api/site-registry/network'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `dev:${DEV_SECRET}`
    driverReturns([{ site_code: 'be', name: 'Belgium', scbd: 0, published: 1 }])

    await expect(pushNetworkSummary()).resolves.toMatchObject({ status: 'pushed', sites: 1 })

    const [call] = fetchCalls
    expect(call.url).toBe('https://prod.test/api/site-registry/network')
    expect(call.url).not.toContain(DEV_SECRET)
    expect(call.options.method).toBe('POST')
    expect(call.options.headers[NETWORK_SUMMARY_TOKEN_HEADER]).toBe(`dev:${DEV_SECRET}`)
    expect(JSON.stringify(call.options.body)).not.toContain(DEV_SECRET)
    expect(Object.keys(call.options.body).sort()).toEqual(['baseHost', 'env', 'multiSiteCode', 'sites'])
  })

  it('reports a failure without throwing, so previous rows stay in place', async () => {
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://prod.test/api/site-registry/network'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `dev:${DEV_SECRET}`
    driverReturns([])
    fetchImpl.mockRejectedValueOnce(new Error('403 Forbidden'))

    await expect(pushNetworkSummary()).resolves.toMatchObject({
      status: 'failed', reason: '403 Forbidden', env: 'dev', multiSiteCode: 'bl2',
    })
  })

  it('reports a build failure as a failed push rather than throwing', async () => {
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://prod.test/api/site-registry/network'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `dev:${DEV_SECRET}`
    dbQuery.mockReset()
    dbQuery.mockRejectedValueOnce(new Error('db down'))

    await expect(pushNetworkSummary()).resolves.toMatchObject({ status: 'failed' })
    expect(fetchCalls).toHaveLength(0)
  })
})

describe('the leak gate over the published surface', () => {
  // Value-shaped detection, not key-name matching: a key-name allowlist misses
  // `panoramaKey` and cannot catch a credential pasted into a benign field.
  const LEAK_SHAPES: [string, RegExp][] = [
    ['a connection URI', /\b(?:mysql|mariadb|smtp|postgres|redis):\/\//i],
    ['a PEM block', /-----BEGIN/],
    ['a bearer credential', /\b(?:bearer\s+|api[-_]?key\s*[:=]|password\s*[:=])/i],
    ['a high-entropy blob', /[A-Za-z0-9+/]{40,}={0,2}/],
  ]

  function assertNoLeak(payload: unknown) {
    const serialised = JSON.stringify(payload)
    for (const [label, shape] of LEAK_SHAPES) {
      expect(serialised, `read response must not contain ${label}`).not.toMatch(shape)
    }
  }

  it('passes against a read response', async () => {
    driverReturns([
      { env: 'dev', multi_site_code: 'bl2', site_code: 'be', name: 'Belgium CHM', scbd: 0, published: 1, base_host: 'cbddev.xyz', updated_at: new Date('2026-09-01T10:00:00Z') },
    ])

    assertNoLeak(await readNetworkSummary())
  })

  it('passes against a validated ingest payload', () => {
    assertNoLeak(parseNetworkSummaryPayload(validPayload()))
  })

  it('catches a leak-shaped value if one ever reached the surface', () => {
    expect(() => assertNoLeak({ baseHost: 'mysql://user:dummy@db/i18n_cache' })).toThrow()
    expect(() => assertNoLeak({ name: '-----BEGIN PRIVATE KEY-----' })).toThrow()
  })
})
