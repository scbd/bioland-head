import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import {
  CONFIG_API_KEY_HEADER,
  CONFIG_DOCUMENT_PATH,
  CONFIG_FETCH_TIMEOUT_MS,
  SUPPORTED_CONFIG_VERSION,
  findLeakInDocument,
  findWrongCasedKey,
} from '../../server/utils/drupal/site-settings'

/**
 * Integration conformance for the Drupal config client (BL-985, p02-05).
 *
 * The check that matters is not "can we reach Drupal today" - it is "does the document this client
 * accepts match the contract p01-01 published". So the SAME conformance function runs against two
 * inputs, and the file never skips:
 *
 * 1. p01-01's machine-checkable example document, always. It is the contract's own artefact, not a
 *    fixture this task wrote, so passing it is a real conformance result even with Drupal down.
 * 2. a live document, when `BL985_CONFIG_DOCUMENT_ORIGIN` names an origin to fetch from. p02-04
 *    serves the route; until it is deployed there is nothing live to point at, so the live leg is
 *    driven by that variable rather than by a hardcoded host. When it is unset the test records
 *    that the live leg did not run - it does not pretend it passed.
 *
 * No browser page is used: the subject is an HTTP document and a pure checker.
 */

const RELATIVE_EXAMPLE = 'tests/fixtures/config-contract/drupal-config-document.example.json'

/**
 * p01-01's example document: this checkout once p01-01 merges, else the sibling `p01-01` worktree
 * (read-only), else an explicit override. Never a substitute authored by this task.
 */
function resolveExampleDocument(): string | null {
  const root = fileURLToPath(new URL('../..', import.meta.url))

  const candidates = [
    resolve(root, RELATIVE_EXAMPLE),
    resolve(root, '../p01-01', RELATIVE_EXAMPLE),
    process.env.BL985_CONTRACT_EXAMPLE_DOCUMENT,
  ]

  return candidates.find(path => path && existsSync(path)) ?? null
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The conformance check itself - every rule `fetchSiteSettings` enforces before it will accept a
 * document, applied to whichever document it is handed. Returns the errors rather than asserting,
 * so both legs report with the same words.
 */
function conformanceErrors(document: unknown): string[] {
  const errors: string[] = []

  if (!isPlainObject(document)) return ['document: expected a JSON object']

  if (!Number.isInteger(document.version)) errors.push('version: missing or not an integer')
  if (document.version !== SUPPORTED_CONFIG_VERSION)
    errors.push(`version: ${String(document.version)} is not the supported version ${SUPPORTED_CONFIG_VERSION}`)

  if (typeof document.siteCode !== 'string' || !document.siteCode)
    errors.push('siteCode: missing or empty')

  if (typeof document.generated !== 'string' || Number.isNaN(Date.parse(document.generated)))
    errors.push('generated: missing or not an ISO-8601 timestamp')

  if (!isPlainObject(document.config)) {
    errors.push('config: missing or not an object')

    return errors
  }

  if (!isPlainObject(document.config.biolandSettings))
    errors.push('config.biolandSettings: missing or not an object')

  const wrongCased = findWrongCasedKey(document)

  if (wrongCased) errors.push(`casing: non-camelCase key at "${wrongCased}"`)

  const leak = findLeakInDocument(document)

  if (leak) errors.push(`leak: ${leak}`)

  return errors
}

test('p01-01 example document conforms to what the client accepts', () => {
  const path = resolveExampleDocument()

  // Not a skip: with no example document anywhere the conformance target is missing, which is a
  // failure of the check's premise and must be loud.
  expect(path, 'p01-01 example document not found in this checkout, the sibling p01-01 worktree, or $BL985_CONTRACT_EXAMPLE_DOCUMENT').not.toBeNull()

  const document: unknown = JSON.parse(readFileSync(path as string, 'utf8'))

  expect(conformanceErrors(document)).toEqual([])
})

test('the live config document conforms, when an origin is configured', async ({ request }) => {
  const origin = process.env.BL985_CONFIG_DOCUMENT_ORIGIN
  const apiKey = process.env.API_KEY

  test.info().annotations.push({
    type: 'live-leg',
    description: origin
      ? `fetching ${CONFIG_DOCUMENT_PATH} from the configured origin`
      : 'BL985_CONFIG_DOCUMENT_ORIGIN unset (p02-04 not deployed): live leg not exercised, example-document leg is the conformance result',
  })

  if (!origin) {
    // The checker itself still runs, against the contract's own artefact, so this file never
    // reports a pass without having conformance-checked something.
    const path = resolveExampleDocument()

    expect(path).not.toBeNull()
    expect(conformanceErrors(JSON.parse(readFileSync(path as string, 'utf8')))).toEqual([])

    return
  }

  const response = await request.get(`${origin}${CONFIG_DOCUMENT_PATH}`, {
    // Header, never a query param: `drupal/index.js:30` puts the key in the query string, which
    // lands a service-account credential in access logs and CDN cache keys.
    headers: apiKey ? { [CONFIG_API_KEY_HEADER]: apiKey } : {},
    timeout: CONFIG_FETCH_TIMEOUT_MS,
  })

  expect(response.status(), 'config endpoint did not answer 200').toBe(200)
  expect(conformanceErrors(await response.json())).toEqual([])
})
