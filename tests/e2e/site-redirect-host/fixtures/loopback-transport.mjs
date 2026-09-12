import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { syncBuiltinESMExports } from 'node:module'

// Subprocess-only transport seam. Keep the real URL construction, middleware,
// normalization, reverse index, Drupal clients and SSR. No application responses
// are manufactured here; named backend requests go to the fixture HTTP server.
const origin = 'http://127.0.0.1:3432'
function mappedURL(url) {
  if (url.origin === 'https://chm.example.test') return origin + url.pathname + url.search
  // Existing thesaurus startup clients have hard-coded upstreams.
  if (url.origin === 'https://api.cbd.int' && url.pathname.startsWith('/api/v2013/thesaurus/domains/')) return origin + '/gaia' + url.pathname.slice(4) + url.search
  if (url.origin === 'https://unstats.un.org' && url.pathname.startsWith('/SDGAPI/')) return origin + '/sdg' + url.pathname + url.search
  if (url.hostname === '127.0.0.1' && ['3431', '3432'].includes(url.port) && url.protocol === 'http:') return url.href
  throw new Error(`BL942 blocked outbound origin: ${url.origin}`)
}
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : input)
  const target = mappedURL(url)
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
  headers.set('x-fixture-origin', url.origin)
  return originalFetch(target, { ...init, headers })
}
https.request = (options, ...args) => {
  if (typeof options === 'object' && !(options instanceof URL) && (options.hostname || options.host) === 'chm.example.test') {
    return http.request({ ...options, protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1', port: 3432,
      agent: undefined, _defaultAgent: http.globalAgent,
      headers: { ...options.headers, host: 'chm.example.test', 'x-fixture-origin': 'https://chm.example.test' },
    }, ...args)
  }
  throw new Error('BL942 blocked unmapped HTTPS request')
}
// Defense in depth for clients not using fetch/https.request. No DNS or remote socket.
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args
  const options = typeof values[0] === 'object' ? values[0] : { port: values[0], host: values[1] }
  if (!['127.0.0.1', '::1', 'localhost'].includes(options.host) || ![3431, 3432].includes(Number(options.port))) {
    throw new Error('BL942 blocked non-fixture socket')
  }
  return connect.apply(this, args)
}
syncBuiltinESMExports()
