/**
 * `registry:drift-check` — notice that a dmsm env config changed since the
 * registry was seeded, re-seed that one slice, and say so in a structured alert.
 *
 * ## Trust boundary — read this before enabling the flag
 *
 * **This task auto-applies whatever the dmsm config tree says, unattended,
 * within one scheduling interval, with no operator in the loop.** Write access
 * to that tree — or a compromised container sharing the mount — is therefore
 * write access to registry columns that reach the browser (`host`, `redirect`,
 * `aliases`, `theme`). Concretely: setting `sites.<code>.redirect` to an
 * external URL redirects every request for that site off-site one tick later,
 * with no deploy, no review and no approval. Before this task, the same change
 * required a human to run `registry:seed`.
 *
 * That trade is deliberate — drift nobody notices is the failure this task
 * exists to prevent — but it is a trade, and the alert is the **only** detection
 * control over it. Hence two rules the code below enforces:
 *
 * 1. Nothing unverifiable is ever reported as a healthy tick. A document with no
 *    dmsm stamp (`hashSource: 'computed'`) and a document whose stamp disagrees
 *    with its own content (`stale-source-hash`) both come back `ok: false`.
 * 2. `reseeded` goes to **stderr** even though it is healthy, so an unattended
 *    apply is never silent.
 *
 * An operator-acknowledgement gate — a human approving each apply — would close
 * the trade rather than document it. That is the user's decision to make, not
 * this task's, and it is deliberately not built here.
 *
 * ## Why dmsm's `meta.hash` is consumed rather than replaced
 *
 * dmsm already hashes every config document on write
 * (`dmsm/server/utils/config/index.js:44-52` → `makeHash`, SHA-1 over
 * `JSON5.stringify(body)` with `meta.hash` removed first). That value is
 * consumed by nothing today, which makes it a free drift key, and reading it
 * rather than inventing a competing definition keeps this check agnostic to the
 * registry's column list: nothing here enumerates registry columns except
 * `config_generation` and `source_hash`, which this task owns.
 *
 * It is **verified, not trusted**. `computeSourceHash` mirrors `makeHash`
 * exactly and runs on every tick:
 *
 * - stamp absent → the computed hash is used, flagged `hashSource: 'computed'`,
 *   and the tick is not healthy: a file written by a path that skipped
 *   `writeConfig` is also the shape an out-of-band edit produces.
 * - stamp present but disagreeing with the content it describes → the content
 *   moved and the stamp did not (a hand edit on the mount, a restore that
 *   rewrote bytes but not metadata). Comparing that stamp would hide a real
 *   publish for as long as nobody re-saved through `writeConfig`, so the tick
 *   returns `stale-source-hash` and re-seeds nothing.
 * - stamp present and agreeing → it is the drift key.
 *
 * ## Ordering: claim, seed, THEN store the hash
 *
 * The new hash is written only after `seedSlice` resolves. Storing it first
 * would mark a failed re-seed as done and the next tick would see "no drift" —
 * exactly the silent failure this task exists to prevent. A failed re-seed
 * leaves `source_hash` at its old value, so the next run retries.
 *
 * Inside the commit the same rule applies one level down. The multiSite
 * `source_hash` is the only value that gates re-detection, so it is written
 * **last** and the pair runs in one transaction: written first, a crash before
 * the second statement would leave the slice row claiming to be current while
 * the site rows carried the old generation, and no later tick would re-detect
 * it. The commit is also **verified** — a zero-row match means the claim was
 * lost or the row is gone, so the hash never landed, and that is
 * `reseed-uncommitted`, not `reseeded`.
 *
 * ## Concurrency
 *
 * Two containers run the same schedule. There is no advisory-lock precedent in
 * this codebase (`GET_LOCK` appears only in docs), so the guard is local and
 * needs no new primitive: a conditional `UPDATE` that bumps `config_generation`
 * only while it still equals the value this run read **and** `source_hash` still
 * differs. Among racers that read the *same* generation, exactly one update
 * affects a row. That is weaker than mutual exclusion: a re-seed that overruns
 * the interval lets the next tick read generation G+1 and claim it while the
 * first is still writing. The writes are idempotent upserts of the same derived
 * rows so they converge, but a lease column would be the stronger guard if that
 * ever stops being true.
 *
 * A lost claim is not assumed to be a lost race. The slice is re-read: if a
 * racer really did win, its hash is now stored and this run reports
 * `skipped-concurrent`. If it is not stored, the claim is failing for a reason
 * that will not fix itself — the row was deleted, or SQL `<>` and JS `===`
 * disagree about equality under a case-insensitive collation — and reporting
 * that as healthy on every tick forever is precisely the bug class this task
 * owns. It is `claim-failed`.
 *
 * ## Outcomes — each one is a different operator action
 *
 * `disabled`, `misconfigured`, `source-unreadable`, `stale-source-hash`,
 * `registry-unavailable`, `not-seeded`, `no-drift`, `skipped-concurrent`,
 * `claim-failed`, `reseeded`, `reseed-uncommitted`, `reseed-failed`.
 * "No drift" and "could not check" must never look alike, or the check's own
 * failure mode becomes "nothing happened".
 *
 * ## Ships disabled
 *
 * `REGISTRY_DRIFT_CHECK_ENABLED` must be set to a recognised truthy value or
 * every tick returns `disabled` having opened nothing. A value that is neither
 * recognisably on nor recognisably off is `misconfigured`, not off: setting this
 * flag *is* the manual ritual that arms an unattended writer, and a typo in it
 * must not read as a healthy inert deployment.
 *
 * ## Invocation in a deployed environment — measured, not assumed
 *
 * `nitro.experimental.tasks: true` alone bundles nothing. **Registering a cron
 * entry in `nitro.scheduledTasks` is what pulls the tasks runtime in.** With the
 * entry added, `yarn build` emits `.output/server/chunks/tasks/drift-check.mjs`
 * (and `seed.mjs`), a croner scheduler, and a `startScheduleRunner()` call in
 * the node-server entry. Verified end to end: `node .output/server/index.mjs`
 * fires the tick and prints this task's alert. So a deployed container **does**
 * run this — which is exactly why it must ship inert behind the flag.
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
 * to an all-caps failure class by `scrubFailureClass`. The derived plan is built
 * only once drift is confirmed, so a quiet tick never holds the derived record
 * set alongside the config document it came from.
 *
 * @module server/tasks/registry/drift-check
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import JSON5 from 'json5'
import { KNOWN_ENVS, buildSeedPlan, parseSeedSource, sourceFileName } from '../../utils/site-registry/seed-source'
import type { SeedPlan, SeedSourceDocument } from '../../utils/site-registry/seed-source'
import { createSeedConnection, scrubFailureClass, seedSlice } from '../../utils/site-registry/write'
import type { SeedConnectionLike } from '../../utils/site-registry/write'
import { MULTI_SITE_TABLE, SITE_TABLE } from '../../utils/site-registry/index'
import { RegistryError } from '../../utils/site-registry/types'
import { getDbConfig } from '../../utils/db/pool'

/** How much of a hash may appear in an alert. Enough to correlate, not to reproduce. */
const HASH_PREFIX_LENGTH = 12

/** Values of `REGISTRY_DRIFT_CHECK_ENABLED` that arm the check. */
const ENABLE_FLAG_ON = new Set(['true', '1', 'yes', 'on', 'enabled'])

/** Values that recognisably mean off. Unset is off; anything else is a typo. */
const ENABLE_FLAG_OFF = new Set(['', 'false', '0', 'no', 'off', 'disabled'])

export type DriftOutcome =
  | 'disabled'
  | 'misconfigured'
  | 'source-unreadable'
  | 'stale-source-hash'
  | 'registry-unavailable'
  | 'not-seeded'
  | 'no-drift'
  | 'skipped-concurrent'
  | 'claim-failed'
  | 'reseeded'
  | 'reseed-uncommitted'
  | 'reseed-failed'

/**
 * Outcomes that are a normal tick. Necessary for `ok`, not sufficient: a tick
 * whose hash could not be verified is never healthy whatever its outcome.
 */
const HEALTHY_OUTCOMES = new Set<DriftOutcome>(['disabled', 'no-drift', 'skipped-concurrent', 'reseeded'])

/**
 * The check is armed but cannot tell which slice or which tree it is checking.
 *
 * Subclassed per cause so `scrubFailureClass` reports a distinct code: an
 * operator reading an alert has to be able to tell a missing config directory
 * from an unknown env without opening the source.
 */
export class RegistryDriftConfigError extends RegistryError {}

export class RegistryDriftEnableFlagError extends RegistryDriftConfigError {
  constructor() {
    super(
      'REGISTRY_DRIFT_ENABLE_FLAG_INVALID',
      `REGISTRY_DRIFT_CHECK_ENABLED is set to a value that is neither on (${[...ENABLE_FLAG_ON].join(' | ')}) nor off (${[...ENABLE_FLAG_OFF].filter(Boolean).join(' | ')})`,
    )
  }
}

export class RegistryDriftEnvMissingError extends RegistryDriftConfigError {
  constructor() {
    super('REGISTRY_DRIFT_ENV_MISSING', 'registry:drift-check requires payload.env or NUXT_PUBLIC_ENV')
  }
}

export class RegistryDriftEnvUnknownError extends RegistryDriftConfigError {
  constructor(env: string) {
    super(
      'REGISTRY_DRIFT_ENV_UNKNOWN',
      `registry:drift-check: unknown env "${env}" (expected ${KNOWN_ENVS.join(' | ')})`,
    )
  }
}

export class RegistryDriftMultiSiteCodeMissingError extends RegistryDriftConfigError {
  constructor() {
    super(
      'REGISTRY_DRIFT_MULTI_SITE_CODE_MISSING',
      'registry:drift-check requires payload.multiSiteCode or NUXT_PUBLIC_MULTI_SITE_CODE',
    )
  }
}

export class RegistryDriftConfigDirMissingError extends RegistryDriftConfigError {
  constructor() {
    super(
      'REGISTRY_DRIFT_CONFIG_DIR_MISSING',
      'registry:drift-check requires payload.configDir or DMSM_CONFIG_DIR',
    )
  }
}

export class RegistryDriftConfigDirEscapeError extends RegistryDriftConfigError {
  constructor() {
    super(
      'REGISTRY_DRIFT_CONFIG_DIR_ESCAPE',
      'registry:drift-check: payload.configDir must resolve inside DMSM_CONFIG_DIR',
    )
  }
}

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
  /** Set only when dmsm's stamp and the content it describes disagree. */
  computedHashPrefix: string | null
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
    // A tick is healthy only if its outcome is benign AND the hash it reached
    // that conclusion with came from dmsm itself. An unstamped document is the
    // shape an out-of-band edit produces, and the stamp is the one signal that
    // separates that from a legitimate write.
    ok: HEALTHY_OUTCOMES.has(outcome) && (fields.hashSource ?? null) !== 'computed',
    env: null,
    multiSiteCode: null,
    hashSource: null,
    previousHashPrefix: null,
    currentHashPrefix: null,
    computedHashPrefix: null,
    configGeneration: null,
    rows: null,
    failureClass: null,
    ...fields,
    at,
  }
}

/**
 * Emit the alert.
 *
 * Only a quiet healthy tick goes to stdout. Everything unhealthy goes to stderr,
 * and so does `reseeded`: it is healthy, but it is also an unattended change to
 * browser-visible config, and the trust boundary above makes "never silent" a
 * requirement rather than a preference.
 */
export function emitDriftAlert(alert: DriftAlert): void {
  const line = JSON.stringify(alert)
  if (alert.ok && alert.outcome !== 'reseeded') console.log(line)
  else console.error(line)
}

/** True when `target` resolves to `base` itself or to somewhere beneath it. */
function isWithin(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Resolve the slice to check and whether the check is on at all.
 *
 * `env` / `multiSiteCode` default to the deployment's existing
 * `NUXT_PUBLIC_ENV` / `NUXT_PUBLIC_MULTI_SITE_CODE`, so a scheduled tick needs no
 * payload and no new env var beyond the enable flag. `DMSM_CONFIG_DIR` is
 * p02-02's and is not defaulted: pointing the check at a config tree is an
 * operator decision. A `configDir` supplied by payload may *narrow* that tree
 * and never leave it, so a manual invocation cannot aim the reader at an
 * arbitrary path.
 *
 * @throws {RegistryDriftConfigError} enabled but not configured — surfaced as
 *   `misconfigured`, with a distinct code per cause.
 */
export function readDriftArguments(
  payload: DriftTaskPayload,
  processEnv: Record<string, string | undefined> = process.env,
) {
  const flag = (processEnv.REGISTRY_DRIFT_CHECK_ENABLED ?? '').trim().toLowerCase()
  const enabled = ENABLE_FLAG_ON.has(flag)
  const pick = (raw: unknown, fallback: string | undefined) =>
    (typeof raw === 'string' && raw.trim() ? raw : (fallback ?? '')).trim()

  const env = pick(payload.env, processEnv.NUXT_PUBLIC_ENV)
  const multiSiteCode = pick(payload.multiSiteCode, processEnv.NUXT_PUBLIC_MULTI_SITE_CODE)
  const configuredDir = (processEnv.DMSM_CONFIG_DIR ?? '').trim()
  const requestedDir = typeof payload.configDir === 'string' ? payload.configDir.trim() : ''
  const configDir = requestedDir || configuredDir

  // Checked before the `enabled` short-circuit: a typo in the one flag that arms
  // an unattended writer must not be indistinguishable from a healthy off switch.
  if (!enabled && !ENABLE_FLAG_OFF.has(flag)) throw new RegistryDriftEnableFlagError()

  if (!enabled) return { enabled, env, multiSiteCode, configDir }

  if (!env) throw new RegistryDriftEnvMissingError()
  if (!KNOWN_ENVS.includes(env)) throw new RegistryDriftEnvUnknownError(env)
  if (!multiSiteCode) throw new RegistryDriftMultiSiteCodeMissingError()
  if (!configDir) throw new RegistryDriftConfigDirMissingError()
  if (requestedDir && !(configuredDir && isWithin(configuredDir, requestedDir))) {
    throw new RegistryDriftConfigDirEscapeError()
  }

  return { enabled, env, multiSiteCode, configDir }
}

/**
 * Reproduce dmsm's `makeHash`.
 *
 * Mirrors `writeConfig`: drop `meta.hash`, guarantee a `meta` object, SHA-1 over
 * `JSON5.stringify`. Deliberately identical so this and dmsm agree about the
 * same content, and so a later `writeConfig` does not read as drift.
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
 * A failed re-seed leaves the bump in place. That is deliberate: a re-seed can
 * fail part-written, so rows really may have changed, and rolling the counter
 * back would tell a future consumer that nothing happened when something did.
 * `source_hash` — not the generation — is what gates re-detection, so the retry
 * loop is unaffected. The cost is that a persistently failing slice inflates the
 * counter by one per tick, which a `BIGINT` absorbs for far longer than this
 * system will exist; a consumer that ever treats a bump as "invalidate caches"
 * must pair the generation with `source_hash` rather than trust it alone.
 *
 * @returns `true` if this run owns the re-seed; `false` if the claim did not land.
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
 * Record the new hash — called only after the re-seed succeeded.
 *
 * Both statements run in one transaction, site rows first and the multiSite
 * `source_hash` last, because that hash is the only value that gates
 * re-detection: written first, a crash before the second statement would leave
 * the slice permanently claiming to be current while its site rows were stale,
 * and no later tick would notice. Written last and transactionally, every crash
 * point leaves `source_hash` old and the next tick retries.
 *
 * @returns `false` when the multiSite update matched no row — the claim was lost
 *   or the row is gone, so nothing was committed and the drift key is unchanged.
 */
export async function commitReseed(
  connection: SeedConnectionLike,
  env: string,
  multiSiteCode: string,
  generation: number,
  hash: string,
): Promise<boolean> {
  await connection.query('START TRANSACTION')
  try {
    await connection.query(
      `UPDATE ${SITE_TABLE} SET config_generation = config_generation + 1, source_hash = ?
        WHERE env = ? AND multi_site_code = ?`,
      [hash, env, multiSiteCode],
    )
    const result = await connection.query(
      `UPDATE ${MULTI_SITE_TABLE} SET source_hash = ?
        WHERE env = ? AND multi_site_code = ? AND config_generation = ?`,
      [hash, env, multiSiteCode, generation],
    )

    if (affectedRows(result) < 1) {
      await connection.query('ROLLBACK')
      return false
    }

    await connection.query('COMMIT')
    return true
  }
  catch (error) {
    await connection.query('ROLLBACK').catch(() => {})
    throw error
  }
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

  // A read, parse or hash failure aborts before any connection is opened, so a
  // malformed source can never be mistaken for "no drift". The plan is NOT
  // derived here — see below.
  let document: SeedSourceDocument
  let hash: { hash: string, source: 'meta' | 'computed' }
  let computed: string
  try {
    const fileName = sourceFileName(configDir, env)
    document = parseSeedSource(await read(fileName), fileName)
    hash = readSourceHash(document)
    // Already the computed value when the stamp was absent; one SHA-1 otherwise.
    computed = hash.source === 'computed' ? hash.hash : computeSourceHash(document)
  }
  catch (error) {
    return alertOf('source-unreadable', at, { ...slice, failureClass: scrubFailureClass(error) })
  }

  const found = { ...slice, hashSource: hash.source, currentHashPrefix: hashPrefix(hash.hash) }

  // dmsm's stamp describes content. When the two disagree the content moved and
  // the stamp did not, so comparing the stamp would hide a real publish.
  if (hash.source === 'meta' && computed !== hash.hash) {
    return alertOf('stale-source-hash', at, { ...found, computedHashPrefix: hashPrefix(computed) })
  }

  let connection: SeedConnectionLike
  try {
    connection = await connect()
  }
  catch (error) {
    return alertOf('registry-unavailable', at, { ...found, failureClass: scrubFailureClass(error) })
  }

  try {
    let state: SliceState | null
    try {
      state = await readSliceState(connection, env, multiSiteCode)
    }
    catch (error) {
      return alertOf('registry-unavailable', at, { ...found, failureClass: scrubFailureClass(error) })
    }

    if (!state) return alertOf('not-seeded', at, found)

    if (state.sourceHash === hash.hash) {
      return alertOf('no-drift', at, {
        ...found,
        previousHashPrefix: hashPrefix(state.sourceHash),
        configGeneration: state.configGeneration,
      })
    }

    const drifted = { ...found, previousHashPrefix: hashPrefix(state.sourceHash) }

    // Derived only now that drift is confirmed. On a quiet tick — which is every
    // tick in steady state — the derived record set is never built, so it never
    // sits in memory alongside the config document it came from.
    let plan: SeedPlan
    try {
      plan = buildSeedPlan(env, multiSiteCode, document)
    }
    catch (error) {
      return alertOf('source-unreadable', at, { ...drifted, failureClass: scrubFailureClass(error) })
    }

    let claimed: boolean
    let after: SliceState | null = null
    try {
      claimed = await claimReseed(connection, env, multiSiteCode, state.configGeneration, hash.hash)
      // A lost claim is not assumed to be a lost race: re-read and find out.
      if (!claimed) after = await readSliceState(connection, env, multiSiteCode)
    }
    catch (error) {
      return alertOf('registry-unavailable', at, { ...drifted, failureClass: scrubFailureClass(error) })
    }

    if (!claimed) {
      // A racer genuinely won: the hash this run wanted to store is stored.
      if (after?.sourceHash === hash.hash) {
        return alertOf('skipped-concurrent', at, { ...drifted, configGeneration: after.configGeneration })
      }
      // Nobody won. The claim is failing for a reason that will not fix itself.
      return alertOf('claim-failed', at, { ...drifted, configGeneration: after?.configGeneration ?? null })
    }

    const generation = state.configGeneration + 1
    let rows: { multiSites: number, sites: number }
    try {
      rows = await seedSlice(connection, plan)
    }
    catch (error) {
      return alertOf('reseed-failed', at, {
        ...drifted,
        configGeneration: generation,
        failureClass: scrubFailureClass(error),
      })
    }

    // Only now is the hash safe to store: a failure above leaves it at the old
    // value so the next tick retries instead of believing itself finished.
    try {
      const committed = await commitReseed(connection, env, multiSiteCode, generation, hash.hash)
      if (committed) return alertOf('reseeded', at, { ...drifted, configGeneration: generation, rows })

      // The rows were written but the drift key was not, so the next tick sees
      // the same drift and re-applies. Never `reseeded`: the one write the whole
      // design rests on did not land.
      return alertOf('reseed-uncommitted', at, { ...drifted, configGeneration: generation, rows })
    }
    catch (error) {
      return alertOf('reseed-failed', at, {
        ...drifted,
        configGeneration: generation,
        rows,
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
