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
 * yarn dev            # in one shell
 * curl -s 'http://localhost:3000/_nitro/tasks/registry:seed?env=stg&multiSiteCode=bl2&dryRun=true'
 * ```
 *
 * Whoever owns the OPS-1 flips therefore needs either a nuxi that exposes a task
 * command or a thin standalone runner — which is why `createSeedConnection`
 * takes its credentials as an argument instead of reaching for
 * `useRuntimeConfig()`: the only thing such a runner has to supply is that
 * object.
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

/**
 * Validate the payload before anything is read.
 *
 * @throws {Error} a required argument is missing or not a known env, which
 *   makes `nuxi task run` exit non-zero.
 */
export function readSeedArguments(payload: SeedTaskPayload, env = process.env) {
  const envName = typeof payload.env === 'string' ? payload.env.trim() : ''
  const multiSiteCode = typeof payload.multiSiteCode === 'string' ? payload.multiSiteCode.trim() : ''
  const configDir = typeof payload.configDir === 'string' && payload.configDir.trim()
    ? payload.configDir.trim()
    : (env.DMSM_CONFIG_DIR ?? '').trim()

  if (!envName) throw new Error('registry:seed requires payload.env (dev | stg | prod)')
  if (!KNOWN_ENVS.includes(envName)) {
    throw new Error(`registry:seed: unknown env "${envName}" (expected ${KNOWN_ENVS.join(' | ')})`)
  }
  if (!multiSiteCode) throw new Error('registry:seed requires payload.multiSiteCode')
  if (!configDir) {
    throw new Error('registry:seed requires payload.configDir or the DMSM_CONFIG_DIR environment variable')
  }

  return { env: envName, multiSiteCode, configDir, dryRun: payload.dryRun === true }
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
    '  multiSites missing a column readMultiSiteConfig requires:',
    ...list(findings.multiSitesMissingRequired),
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
    // malformed source writes nothing at all.
    const document = parseSeedSource(await readFile(fileName, 'utf8'), fileName)

    const findings = collectFindings(env, document)
    for (const line of formatFindings(findings)) console.log(line)

    const plan = buildSeedPlan(env, multiSiteCode, document)

    if (dryRun) {
      console.log(`registry:seed dry run: would upsert 1 multiSite row and ${plan.sites.length} site rows for env=${env} multiSiteCode=${multiSiteCode}`)
      return { result: { dryRun: true, multiSites: 1, sites: plan.sites.length, findings } }
    }

    const connection = await createSeedConnection(getDbConfig())
    try {
      const written = await seedSlice(connection, plan)
      console.log(`registry:seed wrote ${written.multiSites} multiSite row and ${written.sites} site rows for env=${env} multiSiteCode=${multiSiteCode}`)
      return { result: { dryRun: false, ...written, findings } }
    }
    finally {
      await connection.end()
    }
  },
})
