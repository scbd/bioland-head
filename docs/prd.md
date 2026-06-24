---
type: project
references: [docs/CONTEXT.md, docs/architecture.md]
date: 2026-06-23
---

# Bioland Head: Product Requirements

This is the umbrella product PRD for the whole repository, reverse-engineered from the codebase.
Plan-level PRDs for individual features reference this document and reuse the vocabulary in
[docs/CONTEXT.md](./CONTEXT.md).

## Problem Statement

Every party to the Convention on Biological Diversity is expected to run a national Clearing-House
Mechanism: a public website where its government publishes biodiversity information, national
targets, periodic reports, news, and contacts, in its own official languages. There are close to two
hundred parties. Most do not have the budget, hosting, or web team to build and operate a site of
their own, and the ones that do end up with inconsistent, hard-to-maintain sites that drift apart
from each other and from the data the Secretariat already holds.

The content itself is not the gap. Editorial content already lives in a Drupal backend, and the
biodiversity data (national targets, focal points, reports, global indicators) already lives in CBD
and partner data services. What is missing is a single, fast, accessible, multilingual public
frontend that any country can be given without standing up infrastructure, that pulls all of that
existing content together and presents it consistently while still looking like that country's own
site.

## Solution

One Nuxt 4 application serves every Site from a single deployment. It works out which Site a request
is for from the host subdomain, fetches that Site's configuration (locales, theme, country, feature
settings) from DMSM, and then renders pages server-side using content from Drupal and biodiversity
data from the CBD index and partner services. AWS CloudFront sits in front and caches the rendered
output, so hundreds of Sites are served cheaply from one origin.

Each Site keeps its own identity (its colours, logo, menus, languages, and country data) while
sharing the same code, the same components, and the same operational behaviour. Editors continue to
work in Drupal; the frontend reflects their changes and adds an inline edit path back to Drupal for
users who are allowed to use it. A biosafety variant (BCH) reuses the same machinery with a
different home layout.

## User Stories

### Visitor (anonymous reader)

1. As a Visitor, I want the site to open in my country's default language, so that I can read it
   without changing any settings.
2. As a Visitor, I want to switch to any language the Site offers, so that I can read content in a
   language I understand.
3. As a Visitor on a right-to-left language (Arabic, Hebrew, Persian, Urdu, and the others), I want
   the layout to mirror correctly, so that the page is readable.
4. As a Visitor, I want the home page to show the latest news, national targets, and resources for
   my country, so that I see what is current without searching.
5. As a Visitor, I want to open any content page (news, event, document, project, contact, FAQ) and
   read its full body, images, and attachments, so that I get the complete record.
6. As a Visitor, I want to download a document or media file attached to a page, so that I can keep
   or share it.
7. As a Visitor, I want to watch an embedded video on a page, so that I do not have to leave the
   site.
8. As a Visitor, I want to browse all content of one type (for example all news, or all events)
   through a listing page, so that I can scan what exists.
9. As a Visitor, I want to search across the Site and filter by type, country, date, or tag, so that
   I can find a specific record.
10. As a Visitor, I want breadcrumbs and a record count on listing pages, so that I know where I am
    and how much there is.
11. As a Visitor, I want to read forum topics and the comments on a page, so that I can follow a
    discussion even though I am not signed in.
12. As a Visitor, I want to see my country's national biodiversity targets aligned to the Global
    Biodiversity Framework, so that I understand its commitments.
13. As a Visitor, I want to see my country's GBIF species and occurrence counts, GeoBON indicators,
    and Panorama solutions in home widgets, so that I get global biodiversity context for my country.
14. As a Visitor, I want pages to load quickly and stay readable on a phone, so that the site is
    usable on any connection or device.
15. As a Visitor, I want correct page titles, descriptions, social-share previews, and structured
    data, so that links to the site look right when shared and rank in search.
16. As a Visitor, I want a sitemap and per-language alternate links, so that search engines index
    every language of every page.
17. As a Visitor, I want a clear cookie-consent prompt, so that I control what is stored before any
    non-essential cookies are set.

### Authenticated User and Contributor

18. As a User, I want to sign in with my existing CBD account, so that I do not need a separate login
    for each Site.
19. As a Visitor who tries to comment, I want to be prompted to sign in or register, so that I know
    how to take part.
20. As a signed-in User, I want to post a comment on a page or forum topic, so that I can contribute
    to the discussion.
21. As a signed-in User, I want to reply to an existing comment, so that the conversation stays
    threaded.
22. As a signed-in User, I want my comment that is awaiting approval to be marked as such and visible
    to me, so that I know it was received.
23. As a signed-in User, I want my avatar and display name to appear on my comments, so that others
    know who posted.
24. As a Contributor, I want an Edit button on content I can edit, so that I can jump straight to
    editing it in Drupal.
25. As a Contributor, I want to toggle Edit Mode off, so that I can preview the Site as a Visitor
    sees it.

### Content Manager and Site Manager

26. As a Content Manager, I want edit controls on pages and menus, so that I can correct content and
    navigation in place.
27. As a Site Manager, I want to control which home-page widgets appear for my Site, so that the home
    page reflects what my country wants to highlight.
28. As a Site Manager, I want my Site's colours, logo, and menus to render from configuration, so
    that the Site keeps its national identity without code changes.
29. As a Site Manager, I want to see content that is promoted or sticky even when it would be hidden
    from the public, so that I can review it before it goes live.
30. As a Content Manager, I want to clear my Site's cache after a content change, so that visitors
    see the update without waiting for it to expire.

### SCBD Staff and Administrator

31. As SCBD Staff, I want one deployment to serve every country and the biosafety network, so that I
    operate the whole estate from a single codebase.
32. As SCBD Staff, I want a new Site to come online by adding its DMSM configuration and host, so
    that onboarding a country needs no code change or new deployment.
33. As SCBD Staff, I want each Site to fall back to English when content is missing in a locale, so
    that no page is empty for lack of a translation.
34. As an Administrator, I want to edit system pages and the full menu structure, so that I can
    manage the shared parts of the experience.
35. As an Administrator, I want machine translation of strings cached, so that the same text is not
    retranslated on every request.

### Biosafety (BCH) Site

36. As a Visitor on a biosafety Site, I want a biosafety-specific home layout with biosafety news and
    resources, so that the Site fits its subject even though it shares the codebase.

### Operations and platform

37. As an operator, I want static assets and rendered pages cached at the CDN with the right
    lifetimes, so that the origin stays cheap and fast under load.
38. As an operator, I want user-specific and real-time routes never cached, so that signed-in users
    and live forums always see current data.
39. As an operator, I want a misconfigured or unknown Site to fail clearly rather than serve another
    Site's content, so that tenancy never leaks.
40. As an operator, I want a request for a locale a Site does not serve to return a not-found rather
    than a server error, so that bad URLs degrade cleanly.

## Implementation Decisions

- **Host-based tenancy.** The Site is derived from the leading subdomain of the request host on the
  server, with query-parameter and context-cookie fallbacks for internal server-to-server fetches.
  Tenancy is resolved once per request and cached on the request context.
- **DMSM is the authoritative configuration registry.** Per-Site locales, default locale, country,
  redirect, theme, and feature settings come from DMSM, keyed by environment, multiSiteCode, and
  siteCode. Locale routing and the language switcher follow DMSM, so locale bugs are fixed in DMSM,
  not in code. DMSM config is cached briefly with in-flight request coalescing to avoid a thundering
  herd.
- **Locale resolution has a fixed priority:** explicit route value, then query, then URL path, then
  context cookie, then the Site's DMSM default. English is always added to a Site's locale set as the
  fallback.
- **Locale is not the same as the Drupal langcode.** The app locale is mapped to the matching Drupal
  language when querying content (the app's `zh` is Drupal's `zh-hans`, `tl` is `fil`), because Sites
  vary in how the language is coded.
- **Headless Drupal over JSON:API.** All editorial content, users, menus, comments, and media come
  from Drupal. The server authenticates to Drupal with a service account whose session is cached per
  Site, and passes a visitor's own session cookie through for user-specific reads and for posting
  comments, fetching a CSRF token for mutations.
- **Server-rendered with CDN caching tiers.** Pages render on Nitro and are cached by CloudFront via
  `Cache-Control`: build assets with a one-year max-age (and stale-if-error), dynamic pages for a
  short window with stale-while-revalidate, and user or forum-topic routes not at all (forum listings
  fall through to the short dynamic cache).
- **Biodiversity data is fetched server-side and cached per source.** The CBD index (gaia), GBIF,
  GeoBON, Panorama, and the UN SDG API are called from server routes, each with its own cache
  lifetime, and surfaced through home widgets and content lists.
- **Machine translation is cached.** On-the-fly translation uses AWS Translate, with results cached
  in a MariaDB store so identical text is translated once.
- **Context is a single shared type** across client and server, hydrated through a cookie and the
  site store, so the client renders the same Site the server resolved.
- **The BCH variant is a detected flavour, not a fork.** A biosafety Site is recognised from its host
  and switches layout; it does not duplicate the codebase.

## Testing Decisions

- **Test external behaviour, not internals.** Tests assert what a Visitor or operator observes (the
  rendered page, the API response, the cache header, the redirect), not how a function is written.
- **Highest, fewest seams.** Prefer the public HTTP surface. Server-rendered pages and the server API
  routes are the primary seams; only drop to a unit seam for logic that is awkward to reach from
  HTTP.
- **Unit tests** cover the load-bearing server and shared utilities: context resolution,
  cache-control rules, the auth middleware, Drupal page shaping, the thesaurus utilities, and the
  shared logger. Prior art lives under `tests/unit`.
- **End-to-end tests** drive a real build and server with Playwright, using role-based fixtures that
  apply staging Drupal session cookies to the local server, so tests exercise real staging roles
  without creating local users. Prior art lives under `tests/e2e`, with the ticket-scoped suites in
  `tests/e2e/bl-576-bsl` running against the biosafety target that has real content.
- **A served locale must never 404, and an unserved locale must 404 rather than 500.** Locale gating
  is checked on the server, because the client's view of a Site's locales is stale during hydration.

## Success Metrics

- One deployment serves every Site in the `bl2` country network and the `bsl` biosafety network with
  no per-Site code. Baseline: a single shared codebase today; the metric is that onboarding a Site is
  a DMSM and host change only.
- A request for a locale the Site serves never returns 404; a request for a locale it does not serve
  returns 404, not 500.
- Tenancy never leaks: a request resolves to exactly the Site named by its host, or fails closed.
- CDN cache behaviour is correct by route class: build assets carry a one-year max-age (with
  stale-if-error), dynamic pages a short stale-while-revalidate window, and `me`, comments, and
  forum-topic routes carry `no-store` (forum listings use the short dynamic cache).
- Pages are accessible (WCAG AA) and render correctly on a phone-width viewport, including
  right-to-left languages.
- Shared links carry correct titles, descriptions, canonical and alternate-language URLs, and valid
  structured data.

## Out of Scope

- Authoring or storing editorial content. Drupal owns content; this app only renders it.
- The Drupal backend, its modules, and its theme.
- Managing DMSM configuration. This app reads DMSM; it does not write it.
- User account creation, authentication provider, and permissions. Identity and Roles come from the
  CBD account system and Drupal.
- The upstream biodiversity data services (gaia, GBIF, GeoBON, Panorama, the UN SDG API). This app
  consumes them and does not own their data.
- Deployment, CDN, and infrastructure provisioning beyond honouring the cache headers this app sets.

## Further Notes

- The biosafety (BCH) experience shares this codebase and most of its components; only the home
  layout and a few feeds differ. Treat new features as applying to both unless a story says
  otherwise.
- The glossary in [docs/CONTEXT.md](./CONTEXT.md) is the source of truth for vocabulary; keep user
  stories and code using those terms.
- The system shape these features fit into is in [docs/architecture.md](./architecture.md).
