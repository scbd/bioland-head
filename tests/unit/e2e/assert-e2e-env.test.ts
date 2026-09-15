import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../e2e/assert-e2e-env.mjs', import.meta.url))
const ENV_PATH = fileURLToPath(new URL('../../../.env', import.meta.url))

/** Inherited env with every NUXT_PUBLIC_* key removed, so the child starts clean. */
const baseEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NUXT_PUBLIC_')))

const run = (env: NodeJS.ProcessEnv) =>
  execFileSync(process.execPath, [SCRIPT], { env, encoding: 'utf8', stdio: 'pipe' })

describe('assert-e2e-env preflight', () => {
  // A developer .env on disk legitimately satisfies the check; the failure path is
  // only observable without one, so skip rather than delete the developer's file.
  it.skipIf(existsSync(ENV_PATH))('fails loudly, naming each missing variable', () => {
    let stderr = ''

    try {
      run(baseEnv())
      throw new Error('expected the preflight to exit non-zero')
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? '')
    }

    expect(stderr).toContain('NUXT_PUBLIC_ENV')
    expect(stderr).toContain('NUXT_PUBLIC_MULTI_SITE_CODE')
    expect(stderr).toContain('NUXT_PUBLIC_BASE_HOST')
  })

  it('passes on exported variables alone, with no .env file required', () => {
    const env = {
      ...baseEnv(),
      NUXT_PUBLIC_ENV: 'ci',
      NUXT_PUBLIC_MULTI_SITE_CODE: 'bl2',
      NUXT_PUBLIC_BASE_HOST: 'bl2.chm-cbd.net',
    }

    expect(() => run(env)).not.toThrow()
  })

  it('never echoes a configured value', () => {
    const env = { ...baseEnv(), NUXT_PUBLIC_BASE_HOST: 'tenant-secret.example' }
    let output = ''

    try {
      output = run(env)
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string }
      output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
    }

    expect(output).not.toContain('tenant-secret.example')
  })
})
