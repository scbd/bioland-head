/**
 * `registry:seed` — load one `env x multiSiteCode` slice of the dmsm config into
 * the site registry, idempotently.
 *
 * ## Why a Nitro task and not a standalone script
 *
 * The seeder needs the MariaDB credentials, and those live in `useRuntimeConfig()`
 * (`server/utils/db/pool.ts` reads `i18nDb*`). A standalone `.mjs` under
 * `scripts/` would have to re-implement credential loading — a second place that
 * touches secrets, for no gain — and could not import the TypeScript derivation
 * and write modules without adding a transpiler dependency. `nitro.experimental
 * .tasks` is already on (`nuxt.config.ts:249`), so this costs no configuration.
 *
 * ## Invocation — read this before trying to run it in production
 *
 * **Corrected — an earlier version of this note was wrong.** It claimed Nitro
 * never compiles the tasks runtime into `.output/`. That was true only of a
 * build with no scheduled task registered: `nitro.experimental.tasks: true`
 * alone bundles nothing, but **registering a cron entry in
 * `nitro.scheduledTasks` pulls the tasks runtime in**, and p02-06's entry does.
 * A current `yarn build` emits `.output/server/chunks/tasks/seed.mjs` alongside
 * `drift-check.mjs`, bundles croner, and calls `startScheduleRunner()` from the
 * node-server entry. So this task *does* ship, and a deployed container can run
 * it. Do not reason about production behaviour from the old claim.
 *
 * What is still true: `nuxi` 3.30.0 ships **no `task` command**, so there is no
 * ad-hoc "run it now" CLI, and nothing schedules `registry:seed` itself — it
 * ships present but uninvoked, run either by p02-06's re-seed or by hand. During
 * development the dev server's task endpoint is the way in:
 *
 * ```
 * DMSM_CONFIG_DIR=/path/to/dmsm/config yarn dev      # in one shell
 * curl -s 'http://localhost:3000/_nitro/tasks/registry:seed?env=stg&multiSiteCode=bl2&dryRun=true'
 * ```
 *
 * That route builds its payload from `getQuery(event)`, so **every value arrives
 * as a string** — which is why `dryRun` goes through `parseDryRun` rather than an
 * identity check against `true`, and why an unrecognised spelling refuses to run
 * instead of quietly seeding for real.
 *
 * It is also unauthenticated, so `configDir` may only narrow within the root the
 * environment names (`DMSM_CONFIG_ROOT`, falling back to `DMSM_CONFIG_DIR`); see
 * `resolveConfigDir`.
 *
 * That is fine for the seeding and dry-run passes this task exists for, and it
 * is the right shape for p02-06, which re-invokes the seeder with `runTask()`
 * from inside Nitro. It is **not** a production ops command yet. Whoever owns
 * the OPS-1 flips needs either a Nitro upgrade that bundles tasks or a thin
 * standalone runner — which is why `createSeedConnection` takes its credentials
 * as an argument instead of reaching for `useRuntimeConfig()`: the only thing
 * such a runner would have to supply is that object.
 *
 * `env` and `multiSiteCode` are both required and the task refuses to run
 * without them, so it cannot silently write the wrong slice. `dryRun` derives
 * and reports without opening a connection.
 *
 * The source directory comes from `configDir` in the payload or the
 * `DMSM_CONFIG_DIR` environment variable. It is not defaulted: pointing the
 * seeder at a config tree is an operator decision, and a wrong default would
 * seed a stale file without anyone noticing.
 *
 * ## Handling of the source
 *
 * The file is plaintext credentials from the moment it is read. This task never
 * prints a value, a key inventory paired with a position, a row, or a caught
 * error object. The findings report is key *names* and counts; the derivation
 * (`./../../utils/site-registry/seed-source`) never lets a value out of an
 * allowlisted field, and the write path
 * (`./../../utils/site-registry/write`) disables driver parameter logging and
 * scrubs every failure.
 *
 * @module server/tasks/registry/seed
 */
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { consola } from 'consola'
import {
  KNOWN_ENVS,
  buildSeedPlan,
  collectFindings,
  parseSeedSource,
  sourceFileName,
} from '../../utils/site-registry/seed-source'
import type { SeedFindings } from '../../utils/site-registry/seed-source'
import { createSeedConnection, seedSlice } from '../../utils/site-registry/write'
import { getDbConfig } from '../../utils/db/pool'

export interface SeedTaskPayload {
  env?: unknown
  multiSiteCode?: unknown
  configDir?: unknown
  dryRun?: unknown
}

/** Spellings of `dryRun` that mean "derive and report, write nothing". */
const DRY_RUN_TRUE = new Set(['true', '1'])
/** Spellings that mean "write for real". Anything else is refused. */
const DRY_RUN_FALSE = new Set(['false', '0'])

/**
 * Coerce `dryRun` from a payload that may have come off a query string.
 *
 * Nitro's dev task route builds the payload with `getQuery(event)`, so every
 * value arrives as a STRING. `payload.dryRun === true` therefore read the
 * documented `?dryRun=true` as false and **seeded for real** — the single most
 * dangerous line in this task.
 *
 * Absent is false, because that is the only way a caller can express "just run
 * it". Every other unrecognised value is refused loudly rather than defaulted to
 * false: a typo in this flag is the difference between a report and a write.
 *
 * @throws {Error} the value is neither a boolean nor a recognised spelling.
 */
export function parseDryRun(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false
  if (typeof raw === 'boolean') return raw

  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase()
    if (DRY_RUN_TRUE.has(value)) return true
    if (DRY_RUN_FALSE.has(value)) return false
  }

  throw new Error(
    'registry:seed: payload.dryRun must be true | false | "true" | "false" | "1" | "0". '
    + 'Refusing to run rather than guess — an unrecognised value would otherwise seed for real.',
  )
}

/**
 * Resolve the source directory, confined to an operator-configured root.
 *
 * `configDir` is caller-controlled, and on the only documented way to run this
 * task (the dev task endpoint) that caller is an unauthenticated query string.
 * `resolve(configDir, '<env>.json5')` would otherwise traverse anywhere on the
 * box and put the parsed document's top-level key names into the HTTP response.
 * The filename is pinned to `dev|stg|prod.json5`, which makes it narrow — but
 * p02-06 adds a `scheduledTasks` entry, and a sibling task has already shown
 * that shipping the task runtime is all it takes to make this reachable.
 *
 * So the environment names the root (`DMSM_CONFIG_ROOT`, falling back to
 * `DMSM_CONFIG_DIR`) and the payload may only narrow WITHIN it. A payload
 * `configDir` with no configured root is refused outright.
 *
 * @throws {Error} no root is configured, or the requested directory escapes it.
 */
export function resolveConfigDir(requested: string, env: NodeJS.ProcessEnv): string {
  const root = (env.DMSM_CONFIG_ROOT ?? env.DMSM_CONFIG_DIR ?? '').trim()
  if (!root) {
    throw new Error('registry:seed requires payload.configDir or the DMSM_CONFIG_DIR environment variable')
  }

  const resolvedRoot = resolve(root)
  const resolved = resolve(requested || resolvedRoot)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${sep}`)) {
    // The requested path is not echoed: it is caller-controlled text on an
    // unauthenticated endpoint, and echoing it back is a reflection primitive.
    throw new Error('registry:seed: payload.configDir must resolve inside the configured config root')
  }
  return resolved
}

/**
 * Validate the payload before anything is read.
 *
 * @throws {Error} a required argument is missing, is not a known env, carries an
 *   unrecognised `dryRun`, or points outside the configured config root — each
 *   of which makes the task exit non-zero.
 */
export function readSeedArguments(payload: SeedTaskPayload, env = process.env) {
  const envName = typeof payload.env === 'string' ? payload.env.trim() : ''
  const multiSiteCode = typeof payload.multiSiteCode === 'string' ? payload.multiSiteCode.trim() : ''
  const requestedDir = typeof payload.configDir === 'string' ? payload.configDir.trim() : ''

  if (!envName) throw new Error('registry:seed requires payload.env (dev | stg | prod)')
  if (!KNOWN_ENVS.includes(envName)) {
    throw new Error(`registry:seed: unknown env "${envName}" (expected ${KNOWN_ENVS.join(' | ')})`)
  }
  if (!multiSiteCode) throw new Error('registry:seed requires payload.multiSiteCode')

  const dryRun = parseDryRun(payload.dryRun)
  const configDir = resolveConfigDir(requestedDir, env)

  return { env: envName, multiSiteCode, configDir, dryRun }
}

/**
 * Render the findings as counts and key names.
 *
 * Deliberately free of anything positional: no "key 3 of multiSite X", no
 * ordering that could pair a name with a value someone else can see.
 */
export function formatFindings(findings: SeedFindings): string[] {
  const list = (record: Record<string, number>) =>
    Object.keys(record).length
      ? Object.entries(record).sort().map(([key, count]) => `    ${key}: ${count}`)
      : ['    (none)']

  return [
    `registry:seed findings for env=${findings.env}`,
    `  multiSites present (${findings.counts.multiSites}): ${findings.multiSites.join(', ') || '(none)'}`,
    `  multiSites with config.i18n: ${findings.multiSitesWithConfigI18n.join(', ') || '(none)'}`,
    `  multiSites with config.settings: ${findings.multiSitesWithConfigSettings.join(', ') || '(none)'}`,
    `  sites total: ${findings.counts.sites}`,
    `  sites with theme: ${findings.counts.sitesWithTheme}`,
    `  sites with country: ${findings.counts.sitesWithCountry}`,
    `  sites with countries: ${findings.counts.sitesWithCountries}`,
    `  sites with i18n: ${findings.counts.sitesWithI18n}`,
    `  sites with hasBl1: ${findings.counts.sitesWithHasBl1}`,
    `  sites with logo: ${findings.counts.sitesWithLogo}`,
    `  top-level entries that are not a multiSite: ${findings.nonMultiSiteTopLevelKeys.join(', ') || '(none)'}`,
    '  multiSites missing a column readMultiSiteConfig requires (these REFUSE their slice too):',
    ...list(findings.multiSitesMissingRequired),
    '  sites missing a required field (these REFUSE the slice, they are not just reported):',
    ...list(findings.sitesMissingRequired),
    '  sites whose map key disagrees with their own siteCode:',
    ...list(findings.siteCodeKeyMismatches),
    '  values stored as NULL because the read contract would reject them:',
    ...list(findings.unstorableValueShapes),
    '  unknown config keys (not in the contract):',
    ...list(findings.unknownMultiSiteConfigKeys),
    '  unknown site keys (not in the contract):',
    ...list(findings.unknownSiteKeys),
    '  contract keys deliberately not stored:',
    ...list(findings.droppedKeys),
  ]
}

export default defineTask({
  meta: {
    name: 'registry:seed',
    description: 'Seed one env x multiSiteCode slice of the site registry from its dmsm JSON5 config',
  },

  async run({ payload }: { payload: SeedTaskPayload }) {
    const { env, multiSiteCode, configDir, dryRun } = readSeedArguments(payload ?? {})
    const fileName = sourceFileName(configDir, env)

    // A read or parse failure aborts before any connection is opened, so a
    // malformed source writes nothing at all. A raw ENOENT would put the
    // absolute config path into the HTTP error, so it is wrapped like the parse
    // failure already is — the env name is enough for an operator.
    let text: string
    try {
      text = await readFile(fileName, 'utf8')
    }
    catch {
      throw new Error(`registry:seed: could not read the ${env} config file from the configured config root`)
    }

    // `plan` and `findings` are the only things that outlive this block; the
    // parsed document is hundreds of kilobytes of plaintext credentials, so the
    // reference is dropped as soon as both are derived.
    const { plan, findings } = (() => {
      const document = parseSeedSource(text, fileName)
      const collected = collectFindings(env, document)
      // Logged in here so the report still reaches the operator when the
      // requested slice turns out to be the thing that is missing.
      consola.info(formatFindings(collected).join('\n'))
      return { plan: buildSeedPlan(env, multiSiteCode, document), findings: collected }
    })()
    text = ''

    if (dryRun) {
      consola.info(`registry:seed dry run: would upsert 1 multiSite row and ${plan.sites.length} site rows for env=${env} multiSiteCode=${multiSiteCode}`)
      return { result: { dryRun: true, multiSites: 1, sites: plan.sites.length, findings } }
    }

    const connection = await createSeedConnection(getDbConfig())
    try {
      const written = await seedSlice(connection, plan)
      // The removal count is reported alongside the writes on purpose: pruning
      // a stale row is the one destructive thing a seed does, so it must never
      // happen silently.
      consola.info(`registry:seed wrote ${written.multiSites} multiSite row and ${written.sites} site rows, removed ${written.sitesRemoved} stale site rows, for env=${env} multiSiteCode=${multiSiteCode}`)
      return { result: { dryRun: false, ...written, findings } }
    }
    finally {
      await connection.end()
    }
  },
})
