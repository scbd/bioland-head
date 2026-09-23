import type { H3Event } from 'h3'

/**
 * Scanner Fast-404 Middleware
 *
 * Vulnerability scanners probe a fresh, never-cached path on every request
 * (`/h5/`, `/xy/`, `/wap`, `/static/wap/js/order.js`, `/ipfs/<cid>`, `/wp-login.php`,
 * `/.env`, ...). None of those can ever be real Drupal content, but without this
 * middleware each one runs full SSR: an internal `/api/page` call, a Drupal
 * `router/translate-path` lookup, a cross-locale alias sweep, then an error-page
 * render - all for a path that was never going to resolve.
 *
 * This runs before every 01.* middleware (after 00.cache-clear, which makes no Drupal
 * call for these paths) so a blocked path never reaches 01.context.ts - the middleware
 * that resolves site context via a DMSM/Drupal call. It depends on nothing: pure path
 * classification, no site/auth context required.
 *
 * Real Drupal aliases never carry a dot-extension for downloadable content - e.g.
 * `/document/acb-knowledge-management-plan-2022-2030-2-pdf` uses a `-pdf` SUFFIX in
 * the slug, not a literal `.pdf`. So blocking known non-page extensions is safe.
 *
 * Deliberately NOT blocked: bare `/v2` - it showed up in scanner logs, but Drupal
 * aliases are content-editor-driven and nothing in this codebase can prove no site
 * will ever alias a page to exactly `/v2`. Only extension- and known-prefix-based
 * signals are used, never a single ambiguous literal segment.
 */

// Paths under these prefixes are never candidates for a fast 404: internal Nuxt/Nitro
// endpoints, the API surface, image optimization, and everything served from public/
// (favicon.ico, images/, .well-known/) or a future public/fonts.
const PASSTHROUGH_PREFIXES = [
  '/_nuxt',
  '/__nuxt',
  '/_ipx',
  '/_i18n',
  '/api',
  '/favicon.ico',
  '/.well-known',
  '/fonts',
  '/images',
]

// File extensions the app never serves as a page, and no real Drupal alias uses (aliases
// suffix a slug like `-pdf` rather than carrying a literal dot-extension). `xml` is
// blocked except for `sitemap.xml`, handled separately below.
const BLOCKED_EXTENSIONS = new Set([
  'php', 'asp', 'aspx', 'jsp', 'cgi', 'env', 'git', 'ini', 'bak',
  'sql', 'map', 'js', 'cfm', 'pl', 'sh', 'yml', 'yaml', 'xml',
])

// Known vulnerability-scanner path prefixes seen in the prod capture. Kept short and
// data-driven; bare `/v2` is intentionally excluded - see the file header.
// Matched as a WHOLE path segment so real aliases like `/wapato-national-park` pass:
// an entry matches the segment itself or anything beneath it. An entry ending in `/`
// only matches when it has a child segment (bare `/h5`, `/vendor` stay allowed).
const BLOCKED_SEGMENTS = [
  '/wordpress',
  '/cgi-bin',
  '/wap',
  '/phpmyadmin',
  '/ipfs/',
  '/h5/',
  '/xy/',
  '/vendor/',
]

// Intentionally PARTIAL prefixes, matched without a segment boundary: `/wp-` must catch
// `wp-login.php`, `wp-admin`, `wp-content`, `wp-json`, ...; `/.git` and `/.env` must catch
// `.gitignore`, `.env.local`, ... No real Drupal alias starts with `wp-` or a dot.
const BLOCKED_PARTIAL_PREFIXES = ['/wp-', '/.git', '/.env']

// Canonicalizes the request path so encoding/casing tricks cannot slip past the matchers:
// drops the query, decodes once (keeping the raw path if it is malformed), collapses
// repeated slashes, strips `;matrix` params and trailing dots from the last segment,
// and lowercases.
function normalizePath(path: string): string {
  const raw = path.split('?')[0] || '/'
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Malformed escape sequence: classify the raw path as-is.
  }
  const collapsed = decoded.replace(/\/{2,}/g, '/')
  const lastSlash = collapsed.lastIndexOf('/')
  const lastSegment = collapsed.slice(lastSlash + 1).replace(/;.*$/, '').replace(/\.+$/, '')
  return (collapsed.slice(0, lastSlash + 1) + lastSegment).toLowerCase() || '/'
}

// Strips a single optional leading locale segment (`/en`, `/fr-CA`, ...) so the rest of
// the classification runs on the real path, matching how Nuxt i18n prefixes routes.
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(-[A-Za-z]{2})?(?=\/|$)/, '') || '/'
}

function isAllowedSitemap(pathname: string): boolean {
  return stripLocale(pathname) === '/sitemap.xml'
}

function hasBlockedExtension(pathname: string): boolean {
  const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
  return !!match && BLOCKED_EXTENSIONS.has(match[1].toLowerCase())
}

function matchesSegment(pathname: string, segment: string): boolean {
  if (segment.endsWith('/')) return pathname.startsWith(segment)
  return pathname === segment || pathname.startsWith(`${segment}/`)
}

function hasBlockedPrefix(pathname: string): boolean {
  return (
    BLOCKED_SEGMENTS.some((segment) => matchesSegment(pathname, segment)) ||
    BLOCKED_PARTIAL_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

export default defineEventHandler((event: H3Event) => {
  const pathname = normalizePath(event.path)

  if (PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return
  if (isAllowedSitemap(pathname)) return

  const withoutLocale = stripLocale(pathname)

  // Check the known-prefix list against the RAW path too: a 2-letter scanner prefix like
  // `/xy/` is itself indistinguishable from a locale segment (`/xy` + `/` lookahead), so
  // stripping first would hide it. Extensions never suffer this ambiguity.
  const isBlocked = hasBlockedExtension(withoutLocale) || hasBlockedPrefix(withoutLocale) || hasBlockedPrefix(pathname)
  if (!isBlocked) return

  consola.debug(`[scanner-404] Fast 404 for scanner-shaped path: ${JSON.stringify(pathname.slice(0, 200))}`)

  // no-store: a false positive must never be CDN-cached as a 404 for every visitor.
  event.node.res.statusCode = 404
  event.node.res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  event.node.res.setHeader('Cache-Control', 'no-store')
  if (event.method === 'HEAD') event.node.res.end()
  else event.node.res.end('Not Found')
})
