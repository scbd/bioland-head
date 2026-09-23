import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BL-1135: a client query must never replace the server-derived hosts/site of the request context.

const CTX = Object.freeze({
  siteCode     : 'be',
  identifier   : 'be',
  host         : 'https://be.test',
  localizedHost: 'https://be.test/en',
  baseHost     : 'test',
  locale       : 'en',
  locales      : ['en', 'fr'],
  countries    : ['BE'],
  redirect     : undefined, // present-but-empty, as a site without a DMSM redirect resolves
  config       : {},
})

const EVIL = Object.freeze({
  localizedHost: 'https://evil.example/en',
  host         : 'https://evil.example',
  baseHost     : 'evil.example',
  siteCode     : 'evil',
  identifier   : 'evil',
  locale       : 'xx',
  locales      : ['xx'],
  redirect     : 'evil.example',
  forumAlias   : 'evil-forum',
  topicId      : 'evil-topic',
})

const LEGIT = Object.freeze({ page: '3', rowsPerPage: '7', freeText: 'seeds', schemas: 'news' })

const spies = {}

beforeEach(() => {
  vi.resetModules()

  const identity = (fn) => fn
  for (const name of ['defineEventHandler', 'defineCachedEventHandler', 'cachedEventHandler']) vi.stubGlobal(name, identity)

  vi.stubGlobal('getQuery', () => ({ ...EVIL, ...LEGIT }))
  vi.stubGlobal('getRouterParam', (_event, name) => ({ forumAlias: 'general', topicId: '42', drupalInternalId: '2' })[name])
  vi.stubGlobal('useRequestContext', vi.fn(async () => ({ ...CTX })))
  vi.stubGlobal('passError', (_event, e) => { throw e })
  vi.stubGlobal('createError', (o) => Object.assign(new Error(o.statusMessage), o))
  vi.stubGlobal('getHeader', () => '')
  vi.stubGlobal('consola', { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), success: vi.fn() })
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { multiSiteCode: 'bl2' } }))
  vi.stubGlobal('$fetchBaseOptions', (o) => o)
  vi.stubGlobal('getMenusCacheOptions', () => ({}))
  vi.stubGlobal('getExternalCacheOptions', () => ({}))
  vi.stubGlobal('getListCacheOptions', () => ({}))
  vi.stubGlobal('CACHE_TTL', { CBD_API_LONG: 1 })
  vi.stubGlobal('isBackingOff', () => false)
  vi.stubGlobal('rememberFailure', vi.fn())
  vi.stubGlobal('MENUS_FAILURE_BACKOFF_MS', 1)
  vi.stubGlobal('cleanIndexDataMap', (x) => x)
  vi.stubGlobal('normalizeIndexKeys', (x) => x)
  vi.stubGlobal('addForumIdentifierToContext', vi.fn(async (ctx) => Object.assign(ctx, { tid: 7 })))
  vi.stubGlobal('limitArrayToX', (a) => a)
  vi.stubGlobal('shuffleArrayHourly', (a) => a)
  vi.stubGlobal('sortNT7byToc', () => 0)

  spies.$fetch = vi.fn(async () => ({ data: [] }))
  vi.stubGlobal('$fetch', spies.$fetch)

  for (const name of ['queryScbdIndex', 'useContentTypeIndex', 'useDrupalForums', 'useDrupalTopicMenus', 'useDrupalForumComments']) {
    spies[name] = vi.fn(async () => ({ data: [] }))
    vi.stubGlobal(name, spies[name])
  }
  spies.useDrupalTopics = vi.fn(async () => ({}))
  vi.stubGlobal('useDrupalTopics', spies.useDrupalTopics)
  spies.getAllBySchemas = vi.fn(async () => ({ data: [] }))
  vi.stubGlobal('getAllBySchemas', spies.getAllBySchemas)
})

afterEach(() => vi.unstubAllGlobals())

// handler module -> [spy, index of the merged-context argument]
const MERGING_HANDLERS = [
  ['list/abs.js',                              'queryScbdIndex',         0],
  ['list/bch.js',                              'queryScbdIndex',         0],
  ['list/chm.js',                              'queryScbdIndex',         0],
  ['list/drupal/index.js',                     'useContentTypeIndex',    1],
  ['list/drupal/[drupalInternalId].get.js',    'useContentTypeIndex',    1],
  ['list/topics/index.get.js',                 'useDrupalTopicMenus',    0],
  ['list/widget/nt7.js',                       'getAllBySchemas',        0],
  ['menus/nt7.js',                             'getAllBySchemas',        0],
  ['forums/index.get.js',                      'useDrupalForums',        0],
  ['forums/[forumAlias]/index.get.js',         'useDrupalForums',        0],
  ['forums/[forumAlias]/[topicId].get.js',     'useDrupalTopics',        0],
  ['forums/[forumAlias]/[topicId].get.js',     'useDrupalForumComments', 0],
]

// Static specifiers so Vite resolves the `~` alias; resetModules gives each test fresh globals.
const MODULES = {
  'list/abs.js': () => import('~/server/api/list/abs.js'),
  'list/bch.js': () => import('~/server/api/list/bch.js'),
  'list/chm.js': () => import('~/server/api/list/chm.js'),
  'list/drupal/index.js': () => import('~/server/api/list/drupal/index.js'),
  'list/drupal/[drupalInternalId].get.js': () => import('~/server/api/list/drupal/[drupalInternalId].get.js'),
  'list/topics/index.get.js': () => import('~/server/api/list/topics/index.get.js'),
  'list/widget/nt7.js': () => import('~/server/api/list/widget/nt7.js'),
  'menus/nt7.js': () => import('~/server/api/menus/nt7.js'),
  'forums/index.get.js': () => import('~/server/api/forums/index.get.js'),
  'forums/[forumAlias]/index.get.js': () => import('~/server/api/forums/[forumAlias]/index.get.js'),
  'forums/[forumAlias]/[topicId].get.js': () => import('~/server/api/forums/[forumAlias]/[topicId].get.js'),
  'menus/index.js': () => import('~/server/api/menus/index.js'),
  'menus/index-bch.js': () => import('~/server/api/menus/index-bch.js'),
  'menus/index-chm.js': () => import('~/server/api/menus/index-chm.js'),
  'list/latest.js': () => import('~/server/api/list/latest.js'),
  'list/latest-bch-resources.js': () => import('~/server/api/list/latest-bch-resources.js'),
}

const load = async (path) => (await MODULES[path]()).default

describe('BL-1135 handlers merging query into context', () => {
  it.each(MERGING_HANDLERS)('%s keeps ctx hosts and site over the query (%s)', async (path, spy, argIndex) => {
    await (await load(path))({})

    expect(spies[spy]).toHaveBeenCalled()

    for (const call of spies[spy].mock.calls) {
      const merged = call[argIndex]

      for (const key of ['localizedHost', 'host', 'baseHost', 'siteCode', 'identifier', 'locale', 'locales'])
        expect(merged[key], key).toEqual(CTX[key])

      expect(merged.redirect, 'redirect').toBeUndefined()
      expect(merged).toMatchObject(LEGIT)
    }
  })

  it('keeps the route-derived forum alias and topic id over the query', async () => {
    await (await load('forums/[forumAlias]/index.get.js'))({})
    expect(spies.useDrupalForums.mock.calls[0][0]).toMatchObject({ forumAlias: 'general', tid: 7 })

    await (await load('forums/[forumAlias]/[topicId].get.js'))({})
    expect(spies.useDrupalTopics.mock.calls[0][0]).toMatchObject({ topicId: '42' })
  })

  it('keeps the route drupalInternalId over the query', async () => {
    await (await load('list/drupal/[drupalInternalId].get.js'))({})
    expect(spies.useContentTypeIndex.mock.calls[0][1].drupalInternalId).toBe('2')
  })
})

describe('BL-1135 internal fetches forward the server site, not the client one', () => {
  it.each([
    ['menus/index.js'],
    ['menus/index-bch.js'],
    ['menus/index-chm.js'],
    ['list/latest.js'],
    ['list/latest-bch-resources.js'],
  ])('%s forwards ctx siteCode and locale on every internal $fetch', async (path) => {
    await (await load(path))({})

    const internal = spies.$fetch.mock.calls.filter(([url]) => String(url).startsWith('/api/'))

    expect(internal.length).toBeGreaterThan(0)
    for (const [, options] of internal)
      expect(options.query).toMatchObject({ siteCode: 'be', locale: 'en' })
  })

  it('menus composites still forward the legitimate query keys', async () => {
    await (await load('menus/index-chm.js'))({})

    for (const [, options] of spies.$fetch.mock.calls)
      expect(options.query).toMatchObject(LEGIT)
  })

  it('menus/index routes on ctx.isBchSite, not a query flag', async () => {
    vi.stubGlobal('getQuery', () => ({ isBchSite: 'true' }))
    await (await load('menus/index.js'))({})

    expect(spies.$fetch.mock.calls[0][0]).toBe('/api/menus/index-chm')
  })
})
