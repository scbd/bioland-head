# Bioland Head

The domain glossary for the Bioland headless frontend: one Nuxt 4 codebase that serves hundreds of
national and regional Convention on Biological Diversity (CBD) websites, resolving each one from the
request host and rendering content drawn from Drupal and the CBD data services.

This is a single bounded context. Drupal, DMSM, and the CBD data APIs are separate *systems*, but
this frontend models them all with the one shared language below, so there is no context map.

## Language

### Tenancy and request context

**Site**:
One country or regional website the platform serves, for example Belgium at `be.bl2.chm-cbd.net`.
A Site is identified by the leading subdomain of the request host and carries its own locales,
theme, menus, and content.
_Avoid_: tenant, instance, domain

**siteCode**:
The short identifier for a Site, taken from the host subdomain (`be`, `seed`, `gt`). For a national
Site it is the ISO 3166-1 alpha-2 country code; regional and demo Sites use a non-country code.
_Avoid_: site id, slug, subdomain

**multiSiteCode**:
The identifier for a whole network of Sites in one deployment: `bl2` for the country CHM network,
`bsl` for the biosafety network. Also called the Drupal multisite identifier. Every DMSM lookup is
keyed by it.
_Avoid_: network id, platform code, tenant group

**Context** (SiteContext):
The fully resolved scope of one request: env, siteCode, locale, host, localizedHost, the Site's
served locales, its country (or countries), and its DMSM config. Resolved once per request on the
server, cached on the event, and hydrated to the client.
_Avoid_: scope, request state, session

**Environment** (env):
Which deployment tier a request runs against: `dev`, `stg`, or `prod`. Part of every Context and
every DMSM lookup, and it decides whether a Site's production redirect applies.
_Avoid_: stage, tier, mode

**Locale**:
The active language for a request as a short code (`en`, `fr`, `zh`). A Site serves only the locales
listed in its DMSM config; `en` is always added as the fallback. In this project the app locale can
differ from the Drupal language code for the same language (the app's `zh` maps to Drupal's
`zh-hans`, `tl` to `fil`), so locale-to-langcode is a translation, not an equality.
_Avoid_: language, lang, culture

**Host** / **localizedHost**:
Host is a Site's canonical origin (`https://be.bl2.chm-cbd.net`). localizedHost is that origin with
the locale path prefix appended (`https://be.bl2.chm-cbd.net/en`). In production a Site may override
its Host with a configured redirect domain.
_Avoid_: url, origin, address

**DMSM**:
The external multi-site configuration registry. It is the source of truth for each Site's served
locales, default locale, country, redirect, theme, and feature settings, addressed by
env / multiSiteCode / siteCode. When DMSM and code disagree about which locales a Site serves, DMSM
wins.
_Avoid_: config service, settings API, site registry

**biolandSettings**:
The per-Site feature and behaviour block carried inside the DMSM config's runtime data, for example
which home widgets appear and whether promoted or sticky content is public.
_Avoid_: site settings, options, feature flags

### The CBD clearing-houses

**CBD**:
The Convention on Biological Diversity, the United Nations treaty whose Secretariat operates these
websites.
_Avoid_: the Convention (when the reference is ambiguous)

**SCBD**:
The Secretariat of the CBD, the organisation that runs the platform. Also the source of the staff
roles (`scbd_staff`).
_Avoid_: the Secretariat (when ambiguous)

**CHM**:
Clearing-House Mechanism. The primary kind of Site: a country's national biodiversity information
portal. These make up the `bl2` network.
_Avoid_: portal, national site

**BCH**:
Biosafety Clearing-House. A Site flavour focused on biosafety, detected when the host carries `bch`,
`bsl`, or `biosafety`. It selects the biosafety home layout and the `isBchSite` Context flag. BCH is
a kind of Site, not a separate model.
_Avoid_: biosafety portal, BSL site

**BSL**:
The biosafety network: the `bsl` multiSiteCode and the host marker that flags a Site as a BCH Site.
_Avoid_: biosafety (as a code)

**ABSCH** (ABS):
Access and Benefit-Sharing Clearing-House, a further CBD clearing-house whose content lists and
menus the platform can surface alongside CHM content.
_Avoid_: ABS-CH, benefit sharing site

### Content and navigation (from Drupal)

**Drupal**:
The Drupal 11 backend that owns all editorial content, users, menus, comments, and media, exposed
over JSON:API. This platform is its headless frontend and never stores that content itself.
_Avoid_: backend, CMS, the API

**Page**:
A single piece of content resolvable for a path, fetched from Drupal and rendered by the catch-all
route. A Page is backed by a Drupal node, a media entity, or a taxonomy term depending on its type.
_Avoid_: node, article, document

**Content Type**:
A category of authored Page (news, event, document, contact, project, FAQ, and so on),
corresponding to a Drupal node bundle.
_Avoid_: bundle, node type, post type

**System Page**:
A built-in listing or search Page identified by a taxonomy term id rather than authored as a node,
such as a content-type listing or the full-text search results.
_Avoid_: landing page, special page

**Menu**:
A named navigation tree. Some come from Drupal (main, footer, content types, forums, languages) and
some from the CBD index (focal points, national reports, NBSAP). A Menu is structure, not content.
_Avoid_: nav, navigation, sidebar

**Forum**:
A discussion board, modelled as a taxonomy term. It holds Topics.
_Avoid_: board, category

**Topic**:
A single discussion thread inside a Forum.
_Avoid_: thread, post

**Comment**:
A post made on a Page, a Topic, or a media entity. A Comment may need approval before it is public;
until then it shows only to its author and to managers.
_Avoid_: reply (reserved for the nested reply control), feedback

**Media**:
An image, document, or remote video entity from Drupal that a Page renders inline or offers for
download.
_Avoid_: asset, attachment, file

### Biodiversity reporting and vocabulary (from the CBD index)

**gaia** (CBD index):
The CBD content API at `api.cbd.int`. It provides the Solr-style search index used for cross-Site
biodiversity content lists, and the Thesaurus. The Site store exposes its base as `gaiaApi`.
_Avoid_: cbd api, search service, the index API

**Thesaurus**:
The controlled vocabulary served by gaia, one vocabulary per thesaurus domain. Terms are looked up
by identifier and resolved to localised labels. This is distinct from Drupal's per-Site taxonomy.
_Avoid_: taxonomy, vocabulary list, glossary

**thesaurus domain**:
One named vocabulary within the Thesaurus (`countries`, `regions`, `gbfTargets`, `ecosystems`, and
others), and the `[domain]` route parameter. Note the word collision: "domain" here is a vocabulary,
never a DNS host. When the Host sense is meant, say Host.
_Avoid_: category, namespace, set

**GBF**:
The Kunming-Montreal Global Biodiversity Framework. Its Goals and Targets are Thesaurus vocabulary
the platform surfaces, for example on national target pages.
_Avoid_: post-2020 framework, biodiversity framework

**National Target 7** (NT7):
A Site's set of national biodiversity targets aligned to the GBF, surfaced as cards and carousels
and sourced from gaia documents.
_Avoid_: national targets, NTs

**NBSAP**:
A country's National Biodiversity Strategy and Action Plan, its headline biodiversity plan,
available as a menu and listing.
_Avoid_: strategy, action plan

**National Report** (NR, NR6):
A country's periodic report to the CBD (the sixth and seventh editions), surfaced as menus and
lists.
_Avoid_: report, submission

**Focal Point** (NFP):
A designated national contact for a CBD theme, listed from the CBD index.
_Avoid_: contact, focal person

**Aichi Targets**:
The 2011-2020 biodiversity targets that preceded the GBF, still present as Thesaurus vocabulary.
_Avoid_: legacy targets

### People and access

**User**:
The currently authenticated person, resolved from a Drupal session cookie and exposed through the
`me` store. A request with no valid session is anonymous.
_Avoid_: account, member, visitor

**Visitor**:
An anonymous reader with no Drupal session. A Visitor can browse and read everything published but
cannot post or edit.
_Avoid_: guest, anonymous user (use anonymous as the adjective)

**Role**:
A Drupal permission group that gates editing, in increasing reach: contributor, content_manager,
site_manager, scbd_staff, administrator, on top of plain authenticated. Role decides what edit
controls a User sees.
_Avoid_: permission, group, access level

**Edit Mode**:
The toggle, available to authenticated Users whose Role can edit, that reveals inline edit controls
linking back to Drupal.
_Avoid_: admin mode, editing mode

### External biodiversity data sources

**GBIF**:
The Global Biodiversity Information Facility. A Site's home widget shows its species occurrence and
dataset counts for the Site's country.
_Avoid_: occurrence API

**GeoBON**:
The Group on Earth Observations Biodiversity Observation Network. A widget shows its biodiversity
indicators for the Site's country.
_Avoid_: BON portal

**Panorama**:
The Panorama Solutions portal. A widget shows its nature-based solutions for the Site's country.
_Avoid_: solutions API
