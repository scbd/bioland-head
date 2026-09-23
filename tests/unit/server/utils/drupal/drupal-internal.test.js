import http from 'node:http'
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { $fetch } from 'ofetch'
import SA from 'superagent'
import {
  registerDrupalHost,
  getDrupalInternalTransport,
  applyDrupalInternalFetch,
  drupalInternalSuperagent,
  resetDrupalInternal,
} from '~/server/utils/drupal/drupal-internal.js'
import { $fetchBaseOptions } from '~/server/utils/fetch-options'

// A stand-in for the stack's drupal service: plain http, echoes what it received.
let server
let port

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/user/login') {
      res.setHeader('set-cookie', 'SSESSabc=1; path=/; secure; HttpOnly')
      return res.end('{}')
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({
      path  : req.url,
      host  : req.headers.host,
      proto : req.headers['x-forwarded-proto'] || null,
      cookie: req.headers.cookie || null,
    }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

const TENANT = 'ca.example.test'

const setInternalUrl = (drupalInternalUrl) => {
  globalThis.useRuntimeConfig = () => ({ drupalInternalUrl, public: {} })
}

beforeEach(() => resetDrupalInternal())

afterEach(() => {
  resetDrupalInternal()
  delete globalThis.useRuntimeConfig
})

describe('drupal-internal transport', () => {
  it('stays on public transport when NUXT_DRUPAL_INTERNAL_URL is empty (local dev)', () => {
    setInternalUrl('')
    registerDrupalHost(`https://${TENANT}`)

    const options = { headers: new Headers() }
    applyDrupalInternalFetch({ request: `https://${TENANT}/jsonapi`, options })

    expect(getDrupalInternalTransport(`https://${TENANT}/jsonapi`)).toBeNull()
    expect(options.dispatcher).toBeUndefined()
    expect(options.headers.has('x-forwarded-proto')).toBe(false)
  })

  it('only swaps https requests to registered Drupal hosts', () => {
    setInternalUrl(`http://127.0.0.1:${port}`)
    registerDrupalHost(`https://${TENANT}`)

    expect(getDrupalInternalTransport(`https://${TENANT}/jsonapi`)).not.toBeNull()
    expect(getDrupalInternalTransport(`https://CA.Example.Test/jsonapi`)).not.toBeNull()
    expect(getDrupalInternalTransport('https://api.cbd.int/api/v2013/thesaurus')).toBeNull()
    expect(getDrupalInternalTransport(`http://${TENANT}/jsonapi`)).toBeNull()
    expect(getDrupalInternalTransport(`https://${TENANT}:443/jsonapi`)).not.toBeNull()
    expect(getDrupalInternalTransport(`https://${TENANT}:8443/jsonapi`)).toBeNull()
    expect(getDrupalInternalTransport('not a url')).toBeNull()
  })

  it('sends $fetchBaseOptions requests to the internal service with the tenant Host', async () => {
    setInternalUrl(`http://127.0.0.1:${port}`)
    registerDrupalHost(`https://${TENANT}`)

    const body = await $fetch(`https://${TENANT}/jsonapi/node/page`, $fetchBaseOptions())

    expect(body).toEqual({ path: '/jsonapi/node/page', host: TENANT, proto: 'https', cookie: null })
  })

  it('keeps the Secure Drupal session cookie on the superagent client', async () => {
    setInternalUrl(`http://127.0.0.1:${port}`)
    registerDrupalHost(`https://${TENANT}`)

    const agent = SA.agent().use(drupalInternalSuperagent)

    await agent.post(`https://${TENANT}/user/login`)
    const { body } = await agent.get(`https://${TENANT}/jsonapi`)

    expect(body).toEqual({ path: '/jsonapi', host: TENANT, proto: 'https', cookie: 'SSESSabc=1' })
  })
})
