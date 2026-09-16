import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import {
  CONFIG_API_KEY_HEADER,
  CONFIG_DOCUMENT_PATH,
  CONFIG_DOCUMENT_QUERY,
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
 * inputs:
 *
 * 1. p01-01's machine-checkable example document. It is the contract's own artefact, not a fixture
 *    this task wrote, so passing it is a real conformance result even with Drupal down.
 * 2. a live document, when `BL985_CONFIG_DOCUMENT_ORIGIN` names an origin to fetch from. p02-04
 *    serves the route; until it is deployed there is nothing live to point at, so the live leg is
 *    driven by that variable rather than by a hardcoded host. When it is unset the test records
 *    that the live leg did not run - it does not pretend it passed.
 *
 * Both artefacts belong to SIBLING tasks that are not branch parents of this one: p01-01 owns the
 * example document, p02-04 owns the Drupal module's routing file. Neither is in this checkout, and
 * this file must NOT commit a copy - a conformance check that asserts against a fixture the same
 * task authored proves nothing, and that circularity is exactly the Block 3 defect the previous
 * commit fixed. So each check is gated on its artefact actually resolving, with the reason spelled
 * out in the skip: a permanently-red assertion against a file no repository contains is not a
 * conformance result either, it is just noise that trains the team to ignore this file. The gate is
 * on the ARTEFACT, never on the outcome - once either lands (merged here, or pointed at by its
 * override variable) the check runs and can fail.
 *
 * No browser page is used: the subject is an HTTP document and a pure checker.
 */

const RELATIVE_EXAMPLE = 'tests/fixtures/config-contract/drupal-config-document.example.json'

/**
 * p02-04's Drupal module routing file: this checkout once it merges, else the sibling read-only
 * worktree, else an explicit override. Same resolver shape as the example document, same reason.
 */
function resolveModuleRouting(): string | null {
  const root = fileURLToPath(new URL('../..', import.meta.url))

  const candidates = [
    resolve(root, 'bioland.routing.yml'),
    resolve(root, '../p02-04-module', 'bioland.routing.yml'),
    process.env.BL985_MODULE_ROUTING_YML,
  ]

  return candidates.find(path => path && existsSync(path)) ?? null
}

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

/** The route p02-04 serves, written out once. Both checks below compare against THIS literal. */
const EXPECTED_PATH = '/bioland/api/config'
const EXPECTED_FORMAT = { _format: 'json' }

/**
 * Block 1/2/3 regression, half one: the client's constants against a hardcoded literal.
 *
 * The earlier version of this file built its request URL from `CONFIG_DOCUMENT_PATH`, so a wrong
 * constant was wrong in BOTH places and the check still passed - which is how `/bioland/config`
 * survived against a route served at `/bioland/api/config`. Nothing here derives from the client,
 * and nothing here needs a file from another task, so this half always runs.
 */
test("the client's route path and format are the literals p02-04 serves", () => {
  expect(CONFIG_DOCUMENT_PATH).toBe(EXPECTED_PATH)

  // The route requires `_format: 'json'`, and Drupal derives the request format from `?_format=`,
  // defaulting to `html`. Without the query parameter a correct path still 404s.
  expect(CONFIG_DOCUMENT_QUERY).toEqual(EXPECTED_FORMAT)
})

/**
 * Block 1/2/3 regression, half two: the same literal against p02-04's own routing file, which is
 * what makes the literal above more than an agreement this task has with itself. Gated on that
 * file, because it is p02-04's artefact - see the module comment.
 */
test("the expected route matches p02-04's routing definition", () => {
  const path = resolveModuleRouting()

  test.skip(
    path === null,
    "p02-04's bioland.routing.yml is not in this checkout, the sibling p02-04-module worktree, or $BL985_MODULE_ROUTING_YML. Copying it here would compare this task's literal against a routing file this task wrote; set the override to run this check against the real one.",
  )

  const routing = readFileSync(path as string, 'utf8')
  const block = routing.split(/^bioland\.config_api:$/m)[1]

  expect(block, 'no bioland.config_api route in bioland.routing.yml').toBeDefined()

  expect(block).toContain(`path: '${EXPECTED_PATH}'`)
  expect(block).toContain(`_format: '${EXPECTED_FORMAT._format}'`)
})

test('p01-01 example document conforms to what the client accepts', () => {
  const path = resolveExampleDocument()

  test.skip(
    path === null,
    'p01-01 example document is not in this checkout, the sibling p01-01 worktree, or $BL985_CONTRACT_EXAMPLE_DOCUMENT. It is the contract\'s own artefact; a substitute authored here would make this check assert against itself.',
  )

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
    test.skip(
      true,
      'BL985_CONFIG_DOCUMENT_ORIGIN is unset (p02-04 not deployed): there is no live document to check. The example-document leg above is the conformance result.',
    )

    return
  }

  const response = await request.get(`${origin}${CONFIG_DOCUMENT_PATH}`, {
    // Header, never a query param: `drupal/index.js:30` puts the key in the query string, which
    // lands a service-account credential in access logs and CDN cache keys.
    headers: apiKey ? { [CONFIG_API_KEY_HEADER]: apiKey } : {},
    params: { ...CONFIG_DOCUMENT_QUERY },
    timeout: CONFIG_FETCH_TIMEOUT_MS,
    // Same reason the client sends `redirect: 'manual'`: a redirect would forward the api key to
    // whatever origin it points at. A 3xx here is a failure to report, not a hop to follow.
    maxRedirects: 0,
  })

  expect(response.status(), 'config endpoint did not answer 200').toBe(200)
  expect(conformanceErrors(await response.json())).toEqual([])
})
