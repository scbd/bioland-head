import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const results = join(root, '.test-results')
mkdirSync(results, { recursive: true })
// Nitro's relative filesystem cache lives in this fresh, private directory.
const cwd = mkdtempSync(join(results, 'bl942-runtime-'))
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'production', NUXT_TELEMETRY_DISABLED: '1',
  NITRO_HOST: '127.0.0.1', NITRO_PORT: '3431',
  NUXT_PUBLIC_ENV: 'prod', NUXT_PUBLIC_BASE_HOST: 'generated.example.test',
  NUXT_PUBLIC_MULTI_SITE_CODE: 'bl942fixture', NUXT_PUBLIC_DMSM: 'http://127.0.0.1:3432',
  NUXT_PUBLIC_GAIA_API: 'http://127.0.0.1:3432/gaia', NUXT_PUBLIC_LOG_LEVEL: 'ERROR',
  NUXT_API_USER: 'fixture-user', NUXT_API_USER_PASS: 'fixture-only', NUXT_API_KEY: 'fixture-only',
}
const child = spawn(process.execPath, ['--import', fileURLToPath(new URL('./loopback-transport.mjs', import.meta.url)), join(root, '.output/server/index.mjs')], { cwd, env, stdio: 'inherit' })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 1))
