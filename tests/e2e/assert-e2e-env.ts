import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

/**
 * Public runtime-config values that `nuxt.config.ts` deliberately defaults to `""`.
 * They can only arrive from the environment, and the server context resolver
 * (`server/utils/context-unified.ts`) needs all three to build a cache key.
 */
const REQUIRED_VARS = [
  'NUXT_PUBLIC_ENV',
  'NUXT_PUBLIC_MULTI_SITE_CODE',
  'NUXT_PUBLIC_BASE_HOST',
] as const

const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url))
const EXAMPLE_PATH = fileURLToPath(new URL('../../.env.example', import.meta.url))

/**
 * Verify the local e2e prerequisites before Playwright starts its `webServer`.
 *
 * Without the three variables above, `nuxt dev` still boots and binds its port, but every
 * request throws `getSiteSettings cache key missing required context: env=, multiSiteCode=`.
 * Playwright reports that only as a 120s `webServer` timeout, which hides the real cause.
 * Failing here turns a two-minute mystery into an immediate, actionable message.
 *
 * A root `.env` is a convenience, not a requirement. It is loaded when present, and a variable
 * already exported in the process environment — a CI secret, for example — satisfies the check
 * on its own, with no `.env` on disk.
 *
 * This is a presence check, not a validation one: a set-but-wrong value passes here and is left
 * to fail later, at the point that actually knows what a valid value looks like.
 *
 * Never prints a value — variable names only.
 */
export function assertE2EEnv (): void {
  // Playwright's own process does not load .env; Nuxt does that for the dev server.
  // Load it here purely so the check below can see the values. Absent is fine — the
  // variables may already be exported by the shell or injected by a CI secret store.
  if (existsSync(ENV_PATH)) dotenv.config({ path: ENV_PATH, quiet: true })

  const missing = REQUIRED_VARS.filter(name => !process.env[name]?.trim())

  if (missing.length === 0) return

  throw new Error(
    `Local e2e is missing required environment variables: ${missing.join(', ')}.\n` +
    `These have no default in nuxt.config.ts, so an empty value makes every request fail with\n` +
    `"getSiteSettings cache key missing required context".\n` +
    `Fix: export them, or set them in a root .env (cp ${EXAMPLE_PATH} ${ENV_PATH}).\n` +
    `The committed .env.example already carries working values for all three.`,
  )
}
