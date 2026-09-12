import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

// Backend fixtures only: never serve Nuxt HTML, /api/context, or application APIs.
const fixture = JSON.parse(readFileSync(new URL('./dmsm-config.json', import.meta.url)))
const records = []
const canonical = fixture.sites[fixture.siteCode].redirect
const configPath = `/config/${fixture.env}/${fixture.multiSiteCode}`
const emptyCollections = new Set([
  '/jsonapi/taxonomy_term/content_type', '/jsonapi/taxonomy_term/content_types',
  '/jsonapi/taxonomy_term/system_pages', '/jsonapi/taxonomy_term/forums',
  '/jsonapi/node/forum', '/jsonapi/index/content', '/jsonapi/taxonomy_term/tags',
  '/jsonapi/menu_link_content/menu_link_content',
])

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3432')
  const path = url.pathname
  const send = (data, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  if (path === '/health') return send({ fixture: 'BL-942' })
  if (path === '/requests') return send(records)
  const record = { method: req.method, path, origin: req.headers['x-fixture-origin'] || '', status: 200 }
  records.push(record)
  if (req.method === 'GET' && path === configPath) return send({ sites: fixture.sites, config: fixture.config })
  if (req.method === 'GET' && path === `${configPath}/${fixture.siteCode}`) return send(fixture.sites[fixture.siteCode])
  if (path.startsWith('/gaia/v2013/thesaurus/domains/') || path.startsWith('/sdg/')) return send([])
  if (path === '/gaia/v2013/thesaurus/terms/ca') return send({ identifier: 'ca', name: { en: 'Canada', fr: 'Canada' } })
  if (path === '/gaia/v2013/index/select') return send({ response: { docs: [], numFound: 0 }, facet_counts: { facet_fields: {} } })
  if (record.origin === `https://${canonical}`) {
    if (req.method === 'POST' && path === '/user/login') {
      let body = ''
      for await (const chunk of req) body += chunk
      const login = JSON.parse(body)
      if (login.name !== 'fixture-user' || login.pass !== 'fixture-only') return send({ error: 'Wrong fixture login' }, 403)
      res.setHeader('set-cookie', 'SESSfixture=fixture-only; Path=/; HttpOnly')
      return send({ current_user: { uid: '1', name: 'fixture-user' } })
    }
    const locale = path.match(/^\/(en|fr)(?:\/|$)/)?.[1] || 'en'
    const route = path.replace(/^\/(en|fr)(?=\/)/, '')
    if (route === '/jsonapi/site/site') return send(fixture.drupal.site)
    if (route === '/router/translate-path' && url.searchParams.get('path') === '/') return send({
      entity: { uuid: fixture.drupal.page.data.id, id: 1, type: 'node', bundle: 'content', canonical: `https://${canonical}/${locale}` },
      label: fixture.drupal.page.data.title, isHomePath: true,
    })
    if (route === `/jsonapi/node/content/${fixture.drupal.page.data.id}`) return send(fixture.drupal.page)
    if (route === '/jsonapi/configurable_language/configurable_language') return send(fixture.drupal.languages)
    if (route === '/jsonapi/path_alias/path_alias') return send(fixture.drupal.aliases)
    if (/^\/system\/menu\/[a-z-]+\/linkset$/.test(route)) return send({ linkset: [{ item: [] }] })
    if (emptyCollections.has(route)) return send({ data: [], links: {}, meta: { count: 0 } })
  }
  record.status = 501
  return send({ error: `Unimplemented fixture: ${req.method} ${path}` }, 501)
}).listen(3432, '127.0.0.1')
