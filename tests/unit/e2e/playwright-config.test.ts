import { afterEach, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const requiredVars = ['NUXT_PUBLIC_ENV', 'NUXT_PUBLIC_MULTI_SITE_CODE', 'NUXT_PUBLIC_BASE_HOST']
const preflight = fileURLToPath(new URL('../../e2e/assert-e2e-env.mjs', import.meta.url))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('loads the reuse-enabled config without requiring a new server environment', async () => {
  for (const name of requiredVars) vi.stubEnv(name, '')
  vi.stubEnv('CI', '')

  const { default: config } = await import('../../../playwright.config')

  expect(config.webServer).toMatchObject({ reuseExistingServer: true })
})

it('runs the preflight as standard JavaScript and reports missing names', () => {
  const env = { ...process.env, ...Object.fromEntries(requiredVars.map(name => [name, ''])) }
  const result = spawnSync(process.execPath, [preflight], { env, encoding: 'utf8' })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Local e2e is missing required environment variables')
  for (const name of requiredVars) expect(result.stderr).toContain(name)
  expect(result.stderr).not.toContain('ERR_UNKNOWN_FILE_EXTENSION')
})

it('allows a new server to start when its public prerequisites are provided', () => {
  const env = {
    ...process.env,
    NUXT_PUBLIC_ENV: 'test',
    NUXT_PUBLIC_MULTI_SITE_CODE: 'fixture',
    NUXT_PUBLIC_BASE_HOST: 'example.test',
  }
  const result = spawnSync(process.execPath, [preflight], { env, encoding: 'utf8' })

  expect(result.status, result.stderr).toBe(0)
})
