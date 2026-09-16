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
  NetworkSummarySliceLimitError,
  NetworkSummaryTooLargeError,
  buildNetworkSummary,
  parseNetworkSummaryPayload,
  pushNetworkSummary,
  readCappedBodyText,
  readNetworkSummary,
  resolveNetworkSummaryScope,
  scopeAllowsRead,
  scopeAllowsSlice,
  writeNetworkSummary,
} = mod

const { RegistryError, RegistryUnavailableError } = await import('../../../../../server/utils/site-registry/types')

/** Obviously-fake dummy secrets. Never a real value. */
const DEV_SECRET = 'dummy-dev-not-a-real-token'
const PROD_SECRET = 'dummy-prod-not-a-real-token'
const CONFIGURED = `dev:${DEV_SECRET},prod/bl2:${PROD_SECRET}`

function driverReturns(...results: unknown[]) {
  dbQuery.mockReset()
  for (const result of results) dbQuery.mockResolvedValueOnce(result)
  dbQuery.mockResolvedValue([])
}

/**
 * Queue the two reads `buildNetworkSummary` makes, in order: the slice's
 * `multi_site_config` row (where `baseHost` now comes from), then its sites.
 */
function buildDriverReturns(sites: unknown[], baseHost: unknown = 'cbddev.xyz') {
  driverReturns([{ base_host: baseHost }], sites)
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
    buildDriverReturns([
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
    buildDriverReturns([])
    await buildNetworkSummary('dev', 'bl2')

    const sql = String(dbQuery.mock.calls[1][0])
    expect(sql).toMatch(/SELECT site_code, name, scbd, published/)
    expect(sql).not.toMatch(/\bhost\b|description|has_bl1|theme|settings/)
    expect(dbQuery.mock.calls[1][1]).toEqual(['dev', 'bl2'])
  })

  it('treats an empty slice as a legitimate answer, not a failure', async () => {
    buildDriverReturns([])
    await expect(buildNetworkSummary('dev', 'bl2')).resolves.toMatchObject({ sites: [] })
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

describe('baseHost comes from the per-slice column', () => {
  it('reads it from multi_site_config, keyed by the slice primary key', async () => {
    buildDriverReturns([], 'cbd.int')

    await expect(buildNetworkSummary('prod', 'bl2')).resolves.toMatchObject({ baseHost: 'cbd.int' })

    const sql = String(dbQuery.mock.calls[0][0])
    expect(sql).toMatch(/SELECT base_host/)
    expect(sql).toMatch(/multi_site_config/)
    expect(dbQuery.mock.calls[0][1]).toEqual(['prod', 'bl2'])
  })

  it('prefers the slice column over disagreeing site rows and over runtime config', async () => {
    // The defect this replaces: baseHost was per-row by storage and per-slice by
    // treatment, so whichever row happened to be first decided the whole slice.
    // Here the site rows disagree with each other AND with runtime config; the
    // slice column is the only per-slice authority, so it is the only answer.
    runtimeConfig.public = { env: 'dev', multiSiteCode: 'bl2', baseHost: 'stale.runtime.test' }
    driverReturns(
      [{ base_host: 'cbddev.xyz' }],
      [
        { site_code: 'be', name: 'Belgium', scbd: 0, published: 1, base_host: 'first.wrong.test' },
        { site_code: 'cm', name: 'Cameroon', scbd: 0, published: 1, base_host: 'second.wrong.test' },
      ],
    )

    const summary = await buildNetworkSummary('dev', 'bl2')

    expect(summary.baseHost).toBe('cbddev.xyz')
    expect(JSON.stringify(summary)).not.toContain('wrong.test')
    expect(JSON.stringify(summary)).not.toContain('stale.runtime.test')
  })

  it('binds the one slice value to every inserted row, so rows cannot disagree', async () => {
    buildDriverReturns([
      { site_code: 'be', name: 'Belgium', scbd: 0, published: 1 },
      { site_code: 'cm', name: 'Cameroon', scbd: 0, published: 1 },
    ])
    const summary = await buildNetworkSummary('dev', 'bl2')

    driverReturns()
    await writeNetworkSummary(summary)

    // Both rows ride one batched INSERT, so walk the flattened parameter list
    // seven at a time and check each row group's base_host slot.
    const inserts = dbQuery.mock.calls.filter(call => String(call[0]).includes('INSERT'))
    expect(inserts).toHaveLength(1)

    const params = inserts[0][1] as unknown[]
    expect(params).toHaveLength(14)
    for (let row = 0; row < params.length; row += 7) {
      expect(params[row + 6]).toBe('cbddev.xyz')
    }
  })

  it.each([
    ['no multi_site_config row for the slice', []],
    ['a NULL base_host', [{ base_host: null }]],
  ])('fails the push rather than publishing a null baseHost: %s', async (_label, sliceRows) => {
    driverReturns(sliceRows, [])

    // A registry error, not a silent null — nothing links anywhere without it.
    await expect(buildNetworkSummary('dev', 'bl2')).rejects.toBeInstanceOf(RegistryError)
  })

  it('resolves one baseHost per slice on read, even for rows written before the fix', async () => {
    driverReturns([
      { env: 'dev', multi_site_code: 'bl2', site_code: 'be', name: 'Belgium', scbd: 0, published: 1, base_host: null, updated_at: new Date('2026-09-01T10:00:00Z') },
      { env: 'dev', multi_site_code: 'bl2', site_code: 'cm', name: 'Cameroon', scbd: 0, published: 1, base_host: 'cbddev.xyz', updated_at: new Date('2026-09-01T11:00:00Z') },
    ])

    const [slice] = await readNetworkSummary()
    expect(slice.baseHost).toBe('cbddev.xyz')
    expect(slice.sites).toHaveLength(2)
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

  it('rejects a site entry that is not an object at all', () => {
    expect(() => parseNetworkSummaryPayload(validPayload({ sites: ['be'] })))
      .toThrow(/body\.sites\[0\] — expected an object/)
    expect(() => parseNetworkSummaryPayload(validPayload({ sites: [null] })))
      .toThrow(NetworkSummaryInvalidError)
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

  it('ignores malformed configuration entries, warning once and never printing one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      expect(resolveNetworkSummaryScope(`no-separator,:${DEV_SECRET},qa:${DEV_SECRET},dev:`, DEV_SECRET)).toBeNull()
      expect(resolveNetworkSummaryScope(` dev:${DEV_SECRET} , junk `, DEV_SECRET)).toEqual({ env: 'dev' })

      // Silence would turn a stray character in the receiver's env into a
      // permanent 401 with nothing in the log; repeating it per request would
      // be noise. So: at most once per process, and never an entry verbatim.
      expect(warn.mock.calls.length).toBeLessThanOrEqual(1)
      for (const [message] of warn.mock.calls) {
        expect(String(message)).toContain('NUXT_NETWORK_SUMMARY_INGEST_TOKENS')
        expect(String(message)).not.toContain(DEV_SECRET)
      }
    }
    finally {
      warn.mockRestore()
    }
  })

  it('splits a scope entry on the first colon, so a token may contain one', () => {
    // lastIndexOf would read `dev:aa:bb` as the scope `dev:aa`, reject the
    // entry, and 401 forever with no diagnostic.
    const colonToken = `${DEV_SECRET}:with:colons`
    expect(resolveNetworkSummaryScope(`dev:${colonToken}`, colonToken)).toEqual({ env: 'dev' })
  })

  it('trims a presented token, so a trailing newline is not a permanent 401', () => {
    expect(resolveNetworkSummaryScope(CONFIGURED, `${DEV_SECRET}\n`)).toEqual({ env: 'dev' })
    expect(resolveNetworkSummaryScope(CONFIGURED, '   ')).toBeNull()
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

    // Equality on both halves, not a prefix or a substring. ALLOWED_ENVS is
    // closed today so no env can prefix another, but the comparison must not be
    // what is holding that up.
    expect(scopeAllowsSlice(devScope, 'dev2', 'bl2')).toBe(false)
    expect(scopeAllowsSlice(devScope, 'de', 'bl2')).toBe(false)

    // A multiSiteCode-scoped credential is narrower still.
    const prodScope = resolveNetworkSummaryScope(CONFIGURED, PROD_SECRET)!
    expect(scopeAllowsSlice(prodScope, 'prod', 'bl2')).toBe(true)
    expect(scopeAllowsSlice(prodScope, 'prod', 'bsl')).toBe(false)
    expect(scopeAllowsSlice(prodScope, 'prod', 'bl22')).toBe(false)
    expect(scopeAllowsSlice(prodScope, 'prod2', 'bl2')).toBe(false)
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

    // [0] DELETE, [1] the per-env slice count, [2..] the batched INSERTs.
    const inserts = dbQuery.mock.calls.slice(2)
    expect(inserts).toHaveLength(1)
    expect(inserts[0][1]).toEqual([
      'dev', 'bl2', 'be', 'Belgium CHM', 0, 1, 'cbddev.xyz',
      'dev', 'bl2', 'seed', null, 1, 0, 'cbddev.xyz',
    ])
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
    dbQuery.mockResolvedValueOnce([{ slices: 1 }])               // slice count
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

  it('writes nothing beyond the delete and the slice count for an empty slice', async () => {
    // Constructed directly, not through the parser: the ingest route can no
    // longer produce an empty slice (see the empty-push tests), but
    // writeNetworkSummary must still be well-behaved if one reaches it.
    await writeNetworkSummary({ env: 'dev', multiSiteCode: 'bl2', baseHost: 'cbddev.xyz', sites: [] })
    expect(dbQuery).toHaveBeenCalledTimes(2)
    expect(commit).toHaveBeenCalledOnce()
  })

  it('refuses to create more slices than an env may hold', async () => {
    dbQuery.mockReset()
    dbQuery.mockResolvedValueOnce({ affectedRows: 0 })   // DELETE
    dbQuery.mockResolvedValueOnce([{ slices: 16 }])      // the env is already full
    dbQuery.mockResolvedValue([])

    await expect(writeNetworkSummary(parseNetworkSummaryPayload(validPayload())))
      .rejects.toBeInstanceOf(NetworkSummarySliceLimitError)

    // Nothing was inserted and the existing slices were left alone.
    expect(dbQuery).toHaveBeenCalledTimes(2)
    expect(rollback).toHaveBeenCalledOnce()
    expect(commit).not.toHaveBeenCalled()
  })

  it('batches inserts rather than one round trip per row', async () => {
    const sites = Array.from({ length: 450 }, (_, i) => ({
      siteCode: `s${i}`, name: null, scbd: false, published: true,
    }))

    await writeNetworkSummary(parseNetworkSummaryPayload(validPayload({ sites })))

    // DELETE, the slice count, then ceil(450 / 200) = 3 INSERTs — not 450.
    expect(dbQuery).toHaveBeenCalledTimes(5)
    const [sql, params] = dbQuery.mock.calls[2]
    expect(String(sql).match(/\(\?, \?, \?, \?, \?, \?, \?, CURRENT_TIMESTAMP\)/g)).toHaveLength(200)
    expect(params as unknown[]).toHaveLength(200 * 7)
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
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = DEV_SECRET
    buildDriverReturns([{ site_code: 'be', name: 'Belgium', scbd: 0, published: 1 }])

    await expect(pushNetworkSummary()).resolves.toMatchObject({ status: 'pushed', sites: 1 })

    const [call] = fetchCalls
    expect(call.url).toBe('https://prod.test/api/site-registry/network')
    expect(call.url).not.toContain(DEV_SECRET)
    expect(call.options.method).toBe('POST')
    // The sender's variable is the BARE token, sent verbatim — the scope:token
    // list belongs to the receiver under a different name.
    expect(call.options.headers[NETWORK_SUMMARY_TOKEN_HEADER]).toBe(DEV_SECRET)
    expect(JSON.stringify(call.options.body)).not.toContain(DEV_SECRET)
    expect(Object.keys(call.options.body).sort()).toEqual(['baseHost', 'env', 'multiSiteCode', 'sites'])
  })

  it('reports a failure without throwing, so previous rows stay in place', async () => {
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://prod.test/api/site-registry/network'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `dev:${DEV_SECRET}`
    buildDriverReturns([{ site_code: 'be', name: 'Belgium', scbd: 0, published: 1 }])
    fetchImpl.mockRejectedValueOnce(new Error('403 Forbidden'))

    await expect(pushNetworkSummary()).resolves.toMatchObject({
      status: 'failed', reason: '403 Forbidden', env: 'dev', multiSiteCode: 'bl2',
    })
  })

  it('strips the target URL out of a failure reason, credentials and all', async () => {
    // ofetch formats its message as `[POST] "<url>": 401 …`, so the reason would
    // otherwise carry NUXT_NETWORK_SUMMARY_TARGET_URL — userinfo included.
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://pusher:dummynotreal@prod.test/api/site-registry/network'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `dev:${DEV_SECRET}`
    buildDriverReturns([{ site_code: 'be', name: 'Belgium', scbd: 0, published: 1 }])
    fetchImpl.mockRejectedValueOnce(new Error(
      '[POST] "https://pusher:dummynotreal@prod.test/api/site-registry/network": 401 Unauthorized',
    ))

    const result = await pushNetworkSummary()

    expect(result.status).toBe('failed')
    expect(result.reason).toBe('[POST] "<url>": 401 Unauthorized')
    expect(result.reason).not.toContain('dummynotreal')
    expect(result.reason).not.toContain('prod.test')
    expect(findLeak(result)).toBeNull()
  })

  it('skips an empty summary rather than publishing one that would erase the slice', async () => {
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = 'https://prod.test/api/site-registry/network'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `dev:${DEV_SECRET}`
    buildDriverReturns([])

    await expect(pushNetworkSummary()).resolves.toMatchObject({
      status: 'skipped', env: 'dev', multiSiteCode: 'bl2', sites: 0,
    })
    expect(fetchCalls).toHaveLength(0)
  })

  it('trims a token carrying a trailing newline rather than presenting it verbatim', async () => {
    process.env.NUXT_NETWORK_SUMMARY_TARGET_URL = ' https://prod.test/api/site-registry/network\n'
    process.env.NUXT_NETWORK_SUMMARY_PUSH_TOKEN = `${DEV_SECRET}\n`
    buildDriverReturns([{ site_code: 'be', name: 'Belgium', scbd: 0, published: 1 }])

    await expect(pushNetworkSummary()).resolves.toMatchObject({ status: 'pushed' })

    const [call] = fetchCalls
    expect(call.url).toBe('https://prod.test/api/site-registry/network')
    expect(call.options.headers[NETWORK_SUMMARY_TOKEN_HEADER]).toBe(DEV_SECRET)
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

/* -------------------------------------------------------------------------- */
/* Leak gate                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Value-shaped detection, not key-name matching: a key-name allowlist misses
 * `panoramaKey` and cannot catch a credential pasted into a benign field. This
 * is a local implementation because p02-03's shared helper is not on this
 * branch; when it merges, this block collapses to an import.
 *
 * The first cut of it was escapable five ways, each of which is now a named
 * fixture in ESCAPES below, and each of which motivates one decision here:
 *
 * 1. `https://user:pass@host` — the scheme list only knew mysql/smtp/etc., so
 *    credentials carried on an ordinary web scheme walked straight through.
 *    Userinfo is now detected on ANY scheme, independently of the scheme list.
 * 2. percent-encoded URIs — `mysql%3A%2F%2F…` never matched a literal `://`.
 *    Everything is percent-decoded (repeatedly, for double-encoding) first.
 * 3. lowercase PEM armour — `-----begin …` missed a case-sensitive `-----BEGIN`.
 *    Every pattern is now case-insensitive.
 * 4. prose-embedded labels — `api key is <token>` has no `:` or `=`, and the old
 *    pattern demanded one. The label pattern now spans the prose connectives.
 * 5. lowercase-only tokens — a 40-char lowercase hex string is not caught by any
 *    label and was not caught by the old blob pattern, which also required no
 *    entropy at all. A Shannon-entropy gate replaces it.
 *
 * And the matching false-positive trap, which is why locators are stripped
 * before the entropy scan: the old blob class kept `/` inside a token, so an
 * ordinary logo URL — `.../sites/default/files/styles/thumbnail/logo.png` — is a
 * 40+ character run of `[A-Za-z0-9/]` and was flagged as a secret.
 */

/** Percent-decode repeatedly, so an encoded URI cannot hide behind `%3A%2F%2F`. */
function decodeDeep(value: string): string {
  let current = value
  for (let pass = 0; pass < 3; pass += 1) {
    let next: string
    try {
      next = decodeURIComponent(current)
    }
    catch {
      return current
    }
    if (next === current) break
    current = next
  }
  return current
}

/** Shannon entropy in bits per character. Random-looking text scores high. */
function shannonBits(value: string): number {
  const counts = new Map<string, number>()
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1)

  let bits = 0
  for (const count of counts.values()) {
    const p = count / value.length
    bits -= p * Math.log2(p)
  }
  return bits
}

/** Remove URLs and filesystem-ish paths, which are locators rather than secrets. */
function stripLocators(text: string): string {
  // Runs stop at a quote, because the input is serialised JSON with no
  // whitespace: a `\S*` here would swallow every field after the first URL and
  // turn the entropy scan into a no-op.
  const RUN = '[^\\s"\'<>]*'
  return text
    .replace(new RegExp(`[a-z][a-z0-9+.-]*://${RUN}`, 'gi'), ' ')
    .replace(new RegExp(`${RUN}/${RUN}\\.[a-z0-9]{2,5}\\b`, 'gi'), ' ')
    .replace(new RegExp(`(^|[\\s"'])/${RUN}`, 'g'), ' ')
}

const LEAK_SHAPES: [string, RegExp][] = [
  // Credentials in a URL's userinfo, on ANY scheme — https included.
  ['a credential in a URL', /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i],
  // Schemes that only ever appear in a connection string.
  ['a connection URI', /\b(?:mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|smtps?|ldaps?):\/\//i],
  // Case-insensitive, and tolerant of whitespace inside the armour.
  ['a PEM block', /-{3,}\s*begin\b/i],
  // Labelled secrets, whether assigned (`token=x`) or written as prose
  // (`api key is x`). The connectives are what the first cut was missing.
  [
    'a labelled credential',
    /\b(?:api[\s_-]?key|secret|token|password|passwd|credential|bearer|authorization)\b[\s:="'-]*(?:is|was|=|set\s+to|to)?[\s:="']*[A-Za-z0-9+/_.~-]{12,}/i,
  ],
]

/**
 * A run of base64/hex alphabet long and disordered enough to be a key, not a word.
 *
 * 32 rather than the old 40: an MD5-length token is 32, and the old bound let it
 * through. Entropy alone is not enough to separate a key from a word — a 33-
 * character run of ordinary English letters scores 3.8 bits — so a candidate
 * must also mix letters with digits, which every hex, base64 and prefixed API
 * key does and a concatenated slug does not.
 */
const ENTROPY_CANDIDATE = /[A-Za-z0-9+/=]{32,}/g
const ENTROPY_BITS_THRESHOLD = 3.2

function looksOpaque(candidate: string): boolean {
  return /\d/.test(candidate)
    && /[A-Za-z]/.test(candidate)
    && shannonBits(candidate) >= ENTROPY_BITS_THRESHOLD
}

function findLeak(payload: unknown): string | null {
  const decoded = decodeDeep(JSON.stringify(payload) ?? '')

  for (const [label, shape] of LEAK_SHAPES) {
    if (shape.test(decoded)) return label
  }

  for (const candidate of stripLocators(decoded).match(ENTROPY_CANDIDATE) ?? []) {
    if (looksOpaque(candidate)) return 'a high-entropy blob'
  }

  return null
}

function assertNoLeak(payload: unknown) {
  expect(findLeak(payload), 'published surface must not carry a secret-shaped value').toBeNull()
}

describe('a failing connection release never masks the real result', () => {
  // p02-01 guards this in server/utils/site-registry/index.ts: a throw from
  // release() escapes the finally block past the catch above it, so a caller
  // sees a bare driver error instead of a RegistryUnavailableError — and, on a
  // successful path, a completed operation looks like a failure. The pool
  // reclaims the connection either way, so the throw is swallowed.
  it('does not turn a successful build into a failure', async () => {
    buildDriverReturns([{ site_code: 'be', name: 'Belgium', scbd: 0, published: 1 }])
    release.mockRejectedValueOnce(new Error('connection already returned'))

    await expect(buildNetworkSummary('dev', 'bl2')).resolves.toMatchObject({ baseHost: 'cbddev.xyz' })
  })

  it('does not turn a committed write into a failure', async () => {
    release.mockRejectedValueOnce(new Error('connection already returned'))

    await expect(writeNetworkSummary(parseNetworkSummaryPayload(validPayload()))).resolves.toBeUndefined()
    expect(commit).toHaveBeenCalledOnce()
  })

  it('does not turn a successful read into a failure', async () => {
    driverReturns([])
    release.mockRejectedValueOnce(new Error('connection already returned'))

    await expect(readNetworkSummary()).resolves.toEqual([])
  })
})

describe('an empty push cannot erase a stored slice', () => {
  it('rejects an empty sites array at the ingest boundary', () => {
    // The Block this phase was held on: `sites: []` validated, then
    // `writeNetworkSummary` DELETEd the slice and INSERTed nothing, so a
    // deployment whose site rows were not yet seeded erased its own column in
    // the receiver — baseHost and updatedAt with it.
    expect(() => parseNetworkSummaryPayload(validPayload({ sites: [] })))
      .toThrow(/body\.sites — must not be empty/)
  })

  it('leaves the stored rows untouched, because the write is never reached', async () => {
    expect(() => parseNetworkSummaryPayload(validPayload({ sites: [] })))
      .toThrow(NetworkSummaryInvalidError)

    // No DELETE, no transaction: validation threw before the write path.
    expect(dbQuery).not.toHaveBeenCalled()
    expect(beginTransaction).not.toHaveBeenCalled()
  })
})

describe('the read scope', () => {
  it('admits only a token scoped to the reading deployment\'s own env', () => {
    const devScope = resolveNetworkSummaryScope(CONFIGURED, DEV_SECRET)!
    const prodScope = resolveNetworkSummaryScope(CONFIGURED, PROD_SECRET)!

    // Prod issues dev a write token; it must not read back prod's whole store.
    expect(scopeAllowsRead(devScope, 'prod')).toBe(false)
    expect(scopeAllowsRead(devScope, 'dev')).toBe(true)

    // A multiSiteCode-narrowed scope still reads its own env's whole store.
    expect(scopeAllowsRead(prodScope, 'prod')).toBe(true)
    expect(scopeAllowsRead(prodScope, 'dev')).toBe(false)

    // Equality again, not a prefix: 'dev' must not read 'dev2'.
    expect(scopeAllowsRead(devScope, 'dev2')).toBe(false)

    // An unknown deployment env admits nobody rather than everybody.
    expect(scopeAllowsRead(devScope, '')).toBe(false)
  })
})

describe('the body cap', () => {
  async function* chunks(...parts: string[]) {
    for (const part of parts) yield Buffer.from(part, 'utf8')
  }

  it('reads a body under the limit', async () => {
    await expect(readCappedBodyText(chunks('{"a":', '1}'), undefined, 64)).resolves.toBe('{"a":1}')
  })

  it('refuses a declared content-length over the limit before reading anything', async () => {
    let read = 0
    const source = {
      async* [Symbol.asyncIterator]() {
        read += 1
        yield Buffer.from('x', 'utf8')
      },
    }

    await expect(readCappedBodyText(source, String(4 * 1024 * 1024), 64))
      .rejects.toBeInstanceOf(NetworkSummaryTooLargeError)
    expect(read).toBe(0)
  })

  it('stops mid-stream once the running total passes the limit', async () => {
    let produced = 0
    async function* endless() {
      while (produced < 1000) {
        produced += 1
        yield Buffer.alloc(32, 0x61)
      }
    }

    await expect(readCappedBodyText(endless(), undefined, 64))
      .rejects.toBeInstanceOf(NetworkSummaryTooLargeError)

    // Three 32-byte chunks is all it took: the body was never buffered whole.
    expect(produced).toBeLessThanOrEqual(3)
  })
})

describe('the leak gate over the published surface', () => {
  it('passes against a read response', async () => {
    driverReturns([
      { env: 'dev', multi_site_code: 'bl2', site_code: 'be', name: 'Belgium CHM', scbd: 0, published: 1, base_host: 'cbddev.xyz', updated_at: new Date('2026-09-01T10:00:00Z') },
    ])

    assertNoLeak(await readNetworkSummary())
  })

  it('passes against a validated ingest payload', () => {
    assertNoLeak(parseNetworkSummaryPayload(validPayload()))
  })

  // PEM armour is assembled at runtime rather than written out: a literal one
  // is a secret-scanner finding in its own right, and the repo's pre-commit
  // gitleaks hook blocks the commit. Assembling it also makes the point that
  // the gate matches a shape, not a string this file happens to contain.
  const armour = (label: string) => `${'-'.repeat(5)}${label}${'-'.repeat(5)}`

  // Every fixture is an obviously-fake dummy. Each one escaped the first cut of
  // this gate; each one is the regression test for one repair above.
  const ESCAPES: [string, unknown][] = [
    ['a credential on an https scheme', { baseHost: 'https://svcuser:dummynotreal@registry.internal/summary' }],
    ['a percent-encoded connection URI', { name: 'mysql%3A%2F%2Fu%3Adummynotreal%40db.internal%2Fi18n_cache' }],
    ['lowercase PEM armour', { name: armour('begin rsa private key') }],
    ['a token named in prose, with no separator', { name: 'our api key is dummynotrealtokenvalue1234' }],
    ['a lowercase-only opaque token', { name: 'a3f9c1e7b20d84af16c5309e7dbb42f08c1e5a97' }],
    // 32 characters: under the old 40-character bound entirely.
    ['a short lowercase opaque token', { name: 'a3f9c1e7b20d84af16c5309e7dbb42f0' }],
  ]

  it.each(ESCAPES)('catches %s', (_label, payload) => {
    expect(findLeak(payload)).not.toBeNull()
  })

  it('still catches the two shapes the first cut did catch', () => {
    expect(findLeak({ baseHost: 'mysql://user:dummy@db/i18n_cache' })).not.toBeNull()
    expect(findLeak({ name: armour('BEGIN PRIVATE KEY') })).not.toBeNull()
  })

  // The trap on the other side: a real logo URL is a long run of the same
  // alphabet a base64 key is made of. Flagging it would make the gate noise.
  const INNOCENT: [string, unknown][] = [
    ['an absolute logo URL', { logo: 'https://www.cbd.int/sites/default/files/styles/thumbnail/public/logos/belgium-chm-header.png' }],
    ['a root-relative logo path', { logo: '/sites/default/files/styles/thumbnail/public/logos/belgium-chm-header.png' }],
    ['an ordinary baseHost', { baseHost: 'cbddev.xyz' }],
    ['a long site name', { name: 'Belgium Clearing House Mechanism National Focal Point' }],
    ['a long unseparated slug', { name: 'belgiumchmheaderthumbnaillogofile' }],
    ['a plain API documentation URL', { name: 'https://api.cbd.int/v2024/reference/site-configuration' }],
  ]

  it.each(INNOCENT)('does not flag %s', (_label, payload) => {
    expect(findLeak(payload)).toBeNull()
  })
})
