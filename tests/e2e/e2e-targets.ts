export const E2E_TARGETS = {
  seed: 'http://seed.localhost:3330',
  bsl: 'http://bsl.localhost:3330',
} as const

export type E2ETarget = keyof typeof E2E_TARGETS

export function getE2ETarget (): E2ETarget {
  const target = (process.env.E2E_TARGET || 'seed').trim()

  if (target in E2E_TARGETS) {
    return target as E2ETarget
  }

  return 'seed'
}

export function getE2EBaseURL (): string {
  const override = (process.env.E2E_BASE_URL || '').trim()
  const raw = override || E2E_TARGETS[getE2ETarget()]

  // Normalise: Playwright baseURL should not end with a trailing slash.
  return raw.replace(/\/+$/, '')
}
