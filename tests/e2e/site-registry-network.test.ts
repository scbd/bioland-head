import { expect, test } from '@nuxt/test-utils/playwright'

/**
 * End-to-end cover for the two CHM Network summary HTTP surfaces: a real push
 * into the real ingest route on a running server, then a real read back.
 *
 * ## Prerequisites, and why this file skips instead of failing
 *
 * Both routes talk to the `site_registry` database, and the ingest route needs a
 * token the deployment's operator sets by hand (Plan Rule 26 — no `.env*` file is
 * written by this task). A developer machine without
 * `NUXT_NETWORK_SUMMARY_INGEST_TOKENS` exported, or without the registry schema
 * applied, cannot exercise this at all, and a hard failure there would say
 * nothing about the code. So the file skips loudly with the variable name — never
 * a value — and the route logic itself stays gated by
 * `tests/unit/server/api/site-registry/network-routes.spec.ts`.
 *
 * Start the server with the **receiver** variable — the scoped
 * `<env>[/<multiSiteCode>]:<token>` list — then give this file the bare token and
 * point `E2E_NETWORK_SUMMARY_SCOPE` at the slice it authorises:
 *
 *     NUXT_NETWORK_SUMMARY_INGEST_TOKENS='dev/e2e-bl2:<token>' \
 *     E2E_NETWORK_SUMMARY_TOKEN='<token>' \
 *     E2E_NETWORK_SUMMARY_SCOPE='dev/e2e-bl2' yarn test:e2e
 *
 * The scope's env must match the server's own `runtimeConfig.public.env`, or the
 * read route answers 403: a token scoped to another env may push its own slice
 * but may not read this deployment's whole store.
 *
 * The slice this writes is a synthetic one (`e2e-bl2` by default), so it never
 * collides with a real deployment's rows.
 */

const TOKEN = process.env.E2E_NETWORK_SUMMARY_TOKEN
const [SCOPE_ENV = 'dev', SCOPE_MULTI_SITE = 'e2e-bl2'] =
  (process.env.E2E_NETWORK_SUMMARY_SCOPE || '').split('/')

const HEADER = 'x-network-summary-token'
const ROUTE = '/api/site-registry/network'

const SITES = [
  { siteCode: 'e2e-alpha', name: 'E2E Alpha', scbd: false, published: true },
  { siteCode: 'e2e-beta', name: null, scbd: true, published: false },
]

const payload = (overrides: Record<string, unknown> = {}) => ({
  env: SCOPE_ENV,
  multiSiteCode: SCOPE_MULTI_SITE,
  baseHost: 'e2e.example.test',
  sites: SITES,
  ...overrides,
})

test.describe('CHM Network summary ingest and read', () => {
  test.skip(
    !TOKEN,
    'E2E_NETWORK_SUMMARY_TOKEN is not set; the registry-backed network summary e2e cannot run.',
  )

  test('rejects an unauthenticated request on both routes', async ({ request }) => {
    expect((await request.post(ROUTE, { data: payload() })).status()).toBe(401)
    expect((await request.get(ROUTE)).status()).toBe(401)

    // A token in the query string must not authenticate either route (C7).
    expect((await request.get(`${ROUTE}?token=${TOKEN}`)).status()).toBe(401)
    expect((await request.post(`${ROUTE}?token=${TOKEN}`, { data: payload() })).status()).toBe(401)
  })

  test('pushes a slice and reads it back with exactly the published fields', async ({ request }) => {
    const push = await request.post(ROUTE, { headers: { [HEADER]: TOKEN! }, data: payload() })
    expect(push.status()).toBe(200)
    expect(await push.json()).toMatchObject({ env: SCOPE_ENV, multiSiteCode: SCOPE_MULTI_SITE, sites: 2 })

    const read = await request.get(ROUTE, { headers: { [HEADER]: TOKEN! } })
    expect(read.status()).toBe(200)

    const { slices } = await read.json()
    const slice = slices.find((s: any) => s.env === SCOPE_ENV && s.multiSiteCode === SCOPE_MULTI_SITE)

    expect(slice, 'the pushed slice must be readable back').toBeTruthy()
    expect(Object.keys(slice).sort()).toEqual(['baseHost', 'env', 'multiSiteCode', 'sites', 'updatedAt'])
    expect(slice.baseHost).toBe('e2e.example.test')
    expect(slice.updatedAt).toBeTruthy()

    for (const site of slice.sites) {
      expect(Object.keys(site).sort()).toEqual(['name', 'published', 'scbd', 'siteCode'])
    }
    expect(slice.sites).toEqual(SITES)

    // The p02-03 leak gate, value-shaped, over the whole read response.
    const serialised = JSON.stringify(slices)
    for (const shape of [/\b(?:mysql|mariadb|smtp|postgres|redis):\/\//i, /-----BEGIN/, /[A-Za-z0-9+/]{40,}={0,2}/]) {
      expect(serialised).not.toMatch(shape)
    }
  })

  test('an env query parameter cannot widen the read slice', async ({ request }) => {
    const plain = await request.get(ROUTE, { headers: { [HEADER]: TOKEN! } })
    const widened = await request.get(`${ROUTE}?env=prod`, { headers: { [HEADER]: TOKEN! } })

    expect(widened.status()).toBe(200)
    expect(await widened.json()).toEqual(await plain.json())
  })

  test('a scoped token cannot write another deployment\'s slice', async ({ request }) => {
    const other = SCOPE_ENV === 'prod' ? 'dev' : 'prod'
    const refused = await request.post(ROUTE, {
      headers: { [HEADER]: TOKEN! },
      data: payload({ env: other }),
    })

    expect(refused.status()).toBe(403)

    // The refusal wrote nothing: the caller's own slice is untouched.
    const read = await request.get(ROUTE, { headers: { [HEADER]: TOKEN! } })
    const slices = (await read.json()).slices
    expect(slices.some((s: any) => s.env === other && s.multiSiteCode === SCOPE_MULTI_SITE)).toBe(false)
  })

  test('a rejected payload leaves the previous rows intact', async ({ request }) => {
    const before = await (await request.get(ROUTE, { headers: { [HEADER]: TOKEN! } })).json()

    const rejected = await request.post(ROUTE, {
      headers: { [HEADER]: TOKEN! },
      data: payload({ sites: [{ siteCode: 'e2e-alpha', name: 'x', scbd: false, published: true, host: 'leak.test' }] }),
    })
    expect(rejected.status()).toBe(400)

    const after = await (await request.get(ROUTE, { headers: { [HEADER]: TOKEN! } })).json()
    expect(after).toEqual(before)
  })

  test('an empty push is refused and does not erase the stored slice', async ({ request }) => {
    const before = await (await request.get(ROUTE, { headers: { [HEADER]: TOKEN! } })).json()

    const refused = await request.post(ROUTE, {
      headers: { [HEADER]: TOKEN! },
      data: payload({ sites: [] }),
    })
    expect(refused.status()).toBe(400)

    const after = await (await request.get(ROUTE, { headers: { [HEADER]: TOKEN! } })).json()
    expect(after).toEqual(before)
  })

  test('an oversized body is refused before it is parsed', async ({ request }) => {
    // Well past the 1 MiB cap, and syntactically invalid JSON on top: a 413
    // proves the read was abandoned rather than buffered and handed to a parser
    // (which would have answered 400).
    const oversized = await request.post(ROUTE, {
      headers: { [HEADER]: TOKEN!, 'content-type': 'application/json' },
      data: `[${'x'.repeat(2 * 1024 * 1024)}`,
    })

    expect(oversized.status()).toBe(413)
  })
})
