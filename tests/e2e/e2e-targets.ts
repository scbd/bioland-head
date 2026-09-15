export const E2E_TARGETS = {
  seed: 'http://seed.localhost:3330',
  bsl: 'http://bsl.localhost:3330',
  e2e: 'http://e2e.localhost:3330',
} as const

export type E2ETarget = keyof typeof E2E_TARGETS

const TARGET_NAMES = Object.keys(E2E_TARGETS) as E2ETarget[]

/**
 * Resolve the tenant the suite runs against.
 *
 * An unrecognised `E2E_TARGET` throws instead of falling back. The fallback used to be
 * harmless (a wrong-title failure), but now that per-target expectations gate specs with
 * `test.skip(...)`, a typo would silently skip whole files and report a green run.
 *
 * Error messages name variables and valid target names only - never an environment value.
 */
export function getE2ETarget (): E2ETarget {
  const target = (process.env.E2E_TARGET || '').trim()

  if (!target) return 'e2e'

  if (!(target in E2E_TARGETS)) {
    throw new Error(
      `E2E_TARGET is not a known e2e target. Valid targets: ${TARGET_NAMES.join(', ')}. ` +
      'Unset it to use the default target "e2e".',
    )
  }

  return target as E2ETarget
}

/**
 * Resolve the Playwright `baseURL`.
 *
 * `E2E_BASE_URL` may override the host, but the tenant is resolved from the request `Host`
 * header's first label, so an override whose first label is not the selected target would
 * run one tenant while asserting another's expectations. That divergence is now a hard
 * error rather than a silent mass-skip.
 */
export function getE2EBaseURL (): string {
  const override = (process.env.E2E_BASE_URL || '').trim()
  const target = getE2ETarget()

  if (!override) return E2E_TARGETS[target]

  let host: string
  try {
    host = new URL(override).hostname
  } catch {
    throw new Error('E2E_BASE_URL is not a valid absolute URL.')
  }

  const siteCode = host.split('.')[0]

  if (siteCode !== target) {
    throw new Error(
      `E2E_BASE_URL host does not match the selected target "${target}". The tenant is resolved ` +
      'from the host\'s first label, so the run would use one tenant while asserting another\'s ' +
      `expectations. Set E2E_TARGET to match, or drop E2E_BASE_URL. Valid targets: ${TARGET_NAMES.join(', ')}.`,
    )
  }

  // Normalise: Playwright baseURL should not end with a trailing slash.
  return override.replace(/\/+$/, '')
}
