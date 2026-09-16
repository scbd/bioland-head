/**
 * `registry:drift-check` — notice that a dmsm env config changed since the
 * registry was seeded, re-seed that one slice, and say so in a structured alert.
 *
 * ## Why dmsm's `meta.hash` is consumed, not recomputed
 *
 * dmsm already hashes every config document on write
 * (`dmsm/server/utils/config/index.js:44-52` → `makeHash`, SHA-1 over
 * `JSON5.stringify(body)` with `meta.hash` removed first). That value is
 * consumed by nothing today, which makes it a free drift key. Computing a
 * competing hash here would drift from dmsm's own definition the moment dmsm
 * changes `makeHash`, and two hashes that disagree about "changed" is worse than
 * none. The fallback below mirrors `makeHash` exactly and only runs when
 * `meta.hash` is **absent** — which means dmsm wrote the file by a path that
 * skipped `writeConfig`, so it is logged as such (`hashSource: 'computed'`) and
 * the alert is emitted loudly rather than quietly.
 *
 * Reading the hash rather than deriving one also makes this check **agnostic to
 * the registry's column list**: p02-01's in-flight fix cycle adds columns
 * (`logo`, `name`, `description`, `base_host`) and nothing here enumerates
 * registry columns except `config_generation` and `source_hash`, which this task
 * owns. A rebase onto that schema changes no hash and no comparison.
 *
 * ## Ordering: claim, seed, THEN store the hash
 *
 * The new hash is written only after `seedSlice` resolves. Storing it first
 * would mark a failed re-seed as done and the next tick would see "no drift" —
 * exactly the silent failure this task exists to prevent. A failed re-seed
 * leaves `source_hash` at its old value, so the next run retries.
 *
 * ## Concurrency
 *
 * Two containers run the same schedule. There is no advisory-lock precedent in
 * this codebase (`GET_LOCK` appears only in docs), so the guard is local and
 * needs no new primitive: a conditional `UPDATE` that bumps
 * `config_generation` only while it still equals the value this run read **and**
 * `source_hash` still differs. Exactly one racer's update affects a row; the
 * loser reports `skipped-concurrent` and writes nothing.
 *
 * ## Outcomes — each one is a different operator action
 *
 * `disabled`, `misconfigured`, `source-unreadable`, `registry-unavailable`,
 * `not-seeded`, `no-drift`, `skipped-concurrent`, `reseeded`, `reseed-failed`.
 * "No drift" and "could not check" must never look alike, or the check's own
 * failure mode becomes "nothing happened".
 *
 * ## Ships disabled
 *
 * `REGISTRY_DRIFT_CHECK_ENABLED` must be exactly `true` or every tick returns
 * `disabled` having opened nothing. Setting it is a **manual** env edit, as is
 * the cron entry's presence in `nuxt.config.ts`.
 *
 * ## Invocation in a deployed environment — measured, not assumed
 *
 * p02-02 found no `defineTask`/`runTask` in `.output/` and concluded tasks do
 * not ship. That was true of *its* build: `nitro.experimental.tasks: true` alone
 * bundles nothing. **Registering a cron entry in `nitro.scheduledTasks` is what
 * pulls the tasks runtime in.** With the entry added, `yarn build` emits
 * `.output/server/chunks/tasks/drift-check.mjs` (and `seed.mjs`), a croner
 * scheduler, and a `startScheduleRunner()` call in the node-server entry.
 * Verified end to end: `node .output/server/index.mjs` fires the tick and prints
 * this task's alert. So a deployed container **does** run this — which is
 * exactly why it must ship inert behind `REGISTRY_DRIFT_CHECK_ENABLED`.
 *
 * Two caveats remain. `nuxi` 3.30.0 still has no `task` command, so there is no
 * ad-hoc "run it now" CLI; and each container runs its own scheduler, which is
 * what the concurrency guard above exists for. If an operator ever needs to run
 * the check outside Nitro, the connection factory is injectable and
 * `createSeedConnection` takes credentials as an argument (p02-02): a standalone
 * runner only has to supply that object and call `runDriftCheck`.
 *
 * ## Handling of the source
 *
 * The config is plaintext credentials from the moment it is read. Nothing here
 * prints a value, a row, or a caught driver error: the alert carries codes,
 * counts and hash **prefixes** only, the connection disables driver parameter
 * logging (p02-02's `buildSeedConnectionOptions`), and every failure is reduced
 * to an all-caps failure class by `scrubFailureClass`.
 *
 * @module server/tasks/registry/drift-check
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSON5 from 'json5'
import { buildSeedPlan, parseSeedSource } from '../../utils/site-registry/seed-source'
import type { SeedPlan, SeedSourceDocument } from '../../utils/site-registry/seed-source'
import { createSeedConnection, scrubFailureClass, seedSlice } from '../../utils/site-registry/write'
import type { SeedConnectionLike } from '../../utils/site-registry/write'
import { SITE_REGISTRY_DB } from '../../utils/site-registry/index'
import { getDbConfig } from '../../utils/db/pool'

const MULTI_SITE_TABLE = `${SITE_REGISTRY_DB}.multi_site_config`
const SITE_TABLE = `${SITE_REGISTRY_DB}.site_config`

/** Envs the config tree is known to carry — same set as `registry:seed`. */
const KNOWN_ENVS = ['dev', 'stg', 'prod']

/** How much of a hash may appear in an alert. Enough to correlate, not to reproduce. */
const HASH_PREFIX_LENGTH = 12

export type DriftOutcome =
  | 'disabled'
  | 'misconfigured'
  | 'source-unreadable'
  | 'registry-unavailable'
  | 'not-seeded'
  | 'no-drift'
  | 'skipped-concurrent'
  | 'reseeded'
  | 'reseed-failed'

/** Outcomes that are a normal, healthy tick. Everything else is logged at error level. */
const HEALTHY_OUTCOMES = new Set<DriftOutcome>(['disabled', 'no-drift', 'skipped-concurrent', 'reseeded'])

/**
 * The structured drift alert. Every field is a code, a count, a hash prefix or a
 * timestamp — there is deliberately no field a config value could occupy.
 */
export interface DriftAlert {
  event: 'config.source.drift'
  outcome: DriftOutcome
  ok: boolean
  env: string | null
  multiSiteCode: string | null
  hashSource: 'meta' | 'computed' | null
  previousHashPrefix: string | null
  currentHashPrefix: string | null
  configGeneration: number | null
  rows: { multiSites: number, sites: number } | null
  failureClass: string | null
  at: string
}

export interface DriftTaskPayload {
  env?: unknown
  multiSiteCode?: unknown
  configDir?: unknown
}

export interface DriftCheckDeps {
  processEnv?: Record<string, string | undefined>
  connect?: () => Promise<SeedConnectionLike>
  readSource?: (fileName: string) => Promise<string>
  now?: () => Date
}

/** Trim a hash for display. Never the whole value, so an alert cannot be replayed as one. */
export function hashPrefix(hash: string | null | undefined): string | null {
  return typeof hash === 'string' && hash ? hash.slice(0, HASH_PREFIX_LENGTH) : null
}

function alertOf(outcome: DriftOutcome, at: string, fields: Partial<DriftAlert> = {}): DriftAlert {
  return {
    event: 'config.source.drift',
    outcome,
    ok: HEALTHY_OUTCOMES.has(outcome),
    env: null,
    multiSiteCode: null,
    hashSource: null,
    previousHashPrefix: null,
    currentHashPrefix: null,
    configGeneration: null,
    rows: null,
    failureClass: null,
    ...fields,
    at,
  }
}

/**
 * Emit the alert. Healthy ticks go to stdout, everything else to stderr so a
 * failed check is loud in exactly the place an operator greps.
 */
export function emitDriftAlert(alert: DriftAlert): void {
  const line = JSON.stringify(alert)
  if (alert.ok) console.log(line)
  else console.error(line)
}

/**
 * Resolve the slice to check and whether the check is on at all.
 *
 * `env` / `multiSiteCode` default to the deployment's existing
 * `NUXT_PUBLIC_ENV` / `NUXT_PUBLIC_MULTI_SITE_CODE`, so a scheduled tick needs no
 * payload and no new env var beyond the enable flag. `DMSM_CONFIG_DIR` is
 * p02-02's and is not defaulted: pointing the check at a config tree is an
 * operator decision.
 *
 * @throws {Error} enabled but not configured — surfaced as `misconfigured`.
 */
export function readDriftArguments(
  payload: DriftTaskPayload,
  processEnv: Record<string, string | undefined> = process.env,
) {
  const enabled = (processEnv.REGISTRY_DRIFT_CHECK_ENABLED ?? '').trim().toLowerCase() === 'true'
  const pick = (raw: unknown, fallback: string | undefined) =>
    (typeof raw === 'string' && raw.trim() ? raw : (fallback ?? '')).trim()

  const env = pick(payload.env, processEnv.NUXT_PUBLIC_ENV)
  const multiSiteCode = pick(payload.multiSiteCode, processEnv.NUXT_PUBLIC_MULTI_SITE_CODE)
  const configDir = pick(payload.configDir, processEnv.DMSM_CONFIG_DIR)

  if (!enabled) return { enabled, env, multiSiteCode, configDir }

  if (!env) throw new Error('registry:drift-check requires payload.env or NUXT_PUBLIC_ENV')
  if (!KNOWN_ENVS.includes(env)) {
    throw new Error(`registry:drift-check: unknown env "${env}" (expected ${KNOWN_ENVS.join(' | ')})`)
  }
  if (!multiSiteCode) {
    throw new Error('registry:drift-check requires payload.multiSiteCode or NUXT_PUBLIC_MULTI_SITE_CODE')
  }
  if (!configDir) {
    throw new Error('registry:drift-check requires payload.configDir or DMSM_CONFIG_DIR')
  }

  return { enabled, env, multiSiteCode, configDir }
}

/**
 * Reproduce dmsm's `makeHash` for a document that carries no `meta.hash`.
 *
 * Mirrors `writeConfig`: drop `meta.hash`, guarantee a `meta` object, SHA-1 over
 * `JSON5.stringify`. Deliberately identical so the fallback and the real thing
 * agree on the same content, and so a later `writeConfig` does not read as drift.
 */
export function computeSourceHash(document: SeedSourceDocument): string {
  const body: Record<string, unknown> = { ...document }
  const meta = body.meta
  body.meta = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? Object.fromEntries(Object.entries(meta as Record<string, unknown>).filter(([key]) => key !== 'hash'))
    : {}

  return createHash('sha1').update(JSON5.stringify(body) ?? '').digest('hex')
}

/** Read dmsm's own hash, falling back to recomputing it only when it is absent. */
export function readSourceHash(document: SeedSourceDocument): { hash: string, source: 'meta' | 'computed' } {
  const meta = document.meta
  const declared = meta && typeof meta === 'object'
    ? (meta as Record<string, unknown>).hash
    : undefined

  if (typeof declared === 'string' && /^[0-9a-f]{8,64}$/i.test(declared.trim())) {
    return { hash: declared.trim().toLowerCase(), source: 'meta' }
  }
  return { hash: computeSourceHash(document), source: 'computed' }
}

function affectedRows(result: unknown): number {
  return Number((result as { affectedRows?: number | bigint } | undefined)?.affectedRows ?? 0)
}

/** The claim token for one slice: what the registry currently believes. */
export interface SliceState { sourceHash: string | null, configGeneration: number }

/** Read the slice's drift state. `null` means the slice was never seeded. */
export async function readSliceState(
  connection: SeedConnectionLike,
  env: string,
  multiSiteCode: string,
): Promise<SliceState | null> {
  const rows = await connection.query(
    `SELECT source_hash, config_generation FROM ${MULTI_SITE_TABLE}
      WHERE env = ? AND multi_site_code = ? LIMIT 1`,
    [env, multiSiteCode],
  ) as Array<Record<string, unknown>> | undefined

  const row = Array.isArray(rows) ? rows[0] : undefined
  if (!row) return null

  const raw = row.config_generation
  return {
    sourceHash: typeof row.source_hash === 'string' ? row.source_hash : null,
    configGeneration: typeof raw === 'bigint' ? Number(raw) : Number(raw ?? 0),
  }
}

/**
 * Take the single-writer claim by bumping the generation, but only while the
 * row still looks the way this run read it.
 *
 * @returns `true` if this run owns the re-seed; `false` if another racer took it.
 */
export async function claimReseed(
  connection: SeedConnectionLike,
  env: string,
  multiSiteCode: string,
  generation: number,
  hash: string,
): Promise<boolean> {
  const result = await connection.query(
    `UPDATE ${MULTI_SITE_TABLE} SET config_generation = config_generation + 1
      WHERE env = ? AND multi_site_code = ? AND config_generation = ?
        AND (source_hash IS NULL OR source_hash <> ?)`,
    [env, multiSiteCode, generation, hash],
  )
  return affectedRows(result) > 0
}

/**
 * Record the new hash — called only after the re-seed succeeded. The site rows
 * get the same hash and their own generation bump so per-site callers of
 * `readConfigGeneration` see the change too.
 */
export async function commitReseed(
  connection: SeedConnectionLike,
  env: string,
  multiSiteCode: string,
  generation: number,
  hash: string,
): Promise<void> {
  await connection.query(
    `UPDATE ${MULTI_SITE_TABLE} SET source_hash = ?
      WHERE env = ? AND multi_site_code = ? AND config_generation = ?`,
    [hash, env, multiSiteCode, generation],
  )
  await connection.query(
    `UPDATE ${SITE_TABLE} SET config_generation = config_generation + 1, source_hash = ?
      WHERE env = ? AND multi_site_code = ?`,
    [hash, env, multiSiteCode],
  )
}

/**
 * One drift tick. Never throws: every failure becomes an outcome, because a
 * scheduled check that dies is indistinguishable from one that found nothing.
 */
export async function runDriftCheck(
  payload: DriftTaskPayload = {},
  deps: DriftCheckDeps = {},
): Promise<DriftAlert> {
  const at = (deps.now?.() ?? new Date()).toISOString()
  const read = deps.readSource ?? ((fileName: string) => readFile(fileName, 'utf8'))
  const connect = deps.connect ?? (async () => await createSeedConnection(getDbConfig()))

  let args: ReturnType<typeof readDriftArguments>
  try {
    args = readDriftArguments(payload ?? {}, deps.processEnv ?? process.env)
  }
  catch (error) {
    return alertOf('misconfigured', at, { failureClass: scrubFailureClass(error) })
  }

  const { enabled, env, multiSiteCode, configDir } = args
  const slice = { env: env || null, multiSiteCode: multiSiteCode || null }
  if (!enabled) return alertOf('disabled', at, slice)

  // A read, parse or shape failure aborts before any connection is opened, so a
  // malformed source can never be mistaken for "no drift".
  let document: SeedSourceDocument
  let plan: SeedPlan
  let hash: { hash: string, source: 'meta' | 'computed' }
  try {
    const fileName = resolve(configDir, `${env}.json5`)
    document = parseSeedSource(await read(fileName), fileName)
    hash = readSourceHash(document)
    plan = buildSeedPlan(env, multiSiteCode, document)
  }
  catch (error) {
    return alertOf('source-unreadable', at, { ...slice, failureClass: scrubFailureClass(error) })
  }

  const found = { ...slice, hashSource: hash.source, currentHashPrefix: hashPrefix(hash.hash) }

  let connection: SeedConnectionLike
  try {
    connection = await connect()
  }
  catch (error) {
    return alertOf('registry-unavailable', at, { ...found, failureClass: scrubFailureClass(error) })
  }

  try {
    let state: SliceState | null
    let claimed: boolean
    try {
      state = await readSliceState(connection, env, multiSiteCode)
      if (!state) return alertOf('not-seeded', at, found)

      if (state.sourceHash === hash.hash) {
        return alertOf('no-drift', at, {
          ...found,
          previousHashPrefix: hashPrefix(state.sourceHash),
          configGeneration: state.configGeneration,
        })
      }

      claimed = await claimReseed(connection, env, multiSiteCode, state.configGeneration, hash.hash)
    }
    catch (error) {
      return alertOf('registry-unavailable', at, { ...found, failureClass: scrubFailureClass(error) })
    }

    const drifted = { ...found, previousHashPrefix: hashPrefix(state.sourceHash) }
    if (!claimed) return alertOf('skipped-concurrent', at, drifted)

    const generation = state.configGeneration + 1
    try {
      const rows = await seedSlice(connection, plan)
      // Only now is the hash safe to store: a failure above leaves it at the old
      // value so the next tick retries instead of believing itself finished.
      await commitReseed(connection, env, multiSiteCode, generation, hash.hash)
      return alertOf('reseeded', at, { ...drifted, configGeneration: generation, rows })
    }
    catch (error) {
      return alertOf('reseed-failed', at, {
        ...drifted,
        configGeneration: generation,
        failureClass: scrubFailureClass(error),
      })
    }
  }
  finally {
    await connection.end().catch(() => {})
  }
}

export default defineTask({
  meta: {
    name: 'registry:drift-check',
    description: 'Detect dmsm config drift against the stored source hash and re-seed that slice',
  },

  async run({ payload }: { payload?: DriftTaskPayload }) {
    const alert = await runDriftCheck(payload ?? {})
    emitDriftAlert(alert)
    return { result: alert }
  },
})
