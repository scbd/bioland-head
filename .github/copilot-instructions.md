# Bioland Head - AI Coding Agent Instructions

## Important!
- if this exists follow these memory rules every questions for every response`.github/instructions/personal.md`
- if it exists the default guidance at `.github/instructions/default.instructions.md` is the canonical source of instructions for every response.
- **CRITICAL**:if this exists, Follow the Jira and Git workflow at `.github/instructions/workflow.md` for ALL code generation tasks for every response.

## Speed and Accuracy
- Prioritize speed and accuracy in code generation.
- Use sub agents tool when every you can to save time or verify accuracy.
- same use claude, gemini and codex mcp's as subagent as well.'

## Overview
Multi-site headless Drupal 11 + Nuxt.js 4 system serving hundreds of CBD-related websites from a single codebase. Every request is context-driven by site code, locale, and environment.

## Critical Context System

**Every server operation requires context.** The context object flows through the entire system:

```javascript
// Context structure (from server/utils/context.js)
{
  env: 'dev'|'stg'|'prod',
  multiSiteCode: 'bl2',
  siteCode: 'be',           // Site identifier (e.g., 'be' for Belgium)
  locale: 'en',             // Current locale
  defaultLocale: 'en',
  host: 'https://be.chm-cbd.net',
  localizedHost: 'https://be.chm-cbd.net/en',
  country: 'BE',
  countries: ['BE']
}
```

**Getting context in server routes:**
```javascript
export default defineEventHandler(async (event) => {
  const context = getContext(event);      // From cookies
  const parsed = parseContext(context);   // Parse + enrich
  // Use parsed.siteCode, parsed.locale, parsed.localizedHost etc
});
```

**Context flows via cookie:** All API calls include context cookie set by `plugins/site.js` on initial load.

## Data Flow Architecture

### 1. Initial Page Load (`plugins/site.js`)
```javascript
// Fetches context from DMSM (Drupal Multi-Site Management)
GET /api/context/{siteCode}/{locale}
→ Returns: config, locales, redirect, siteName
→ Stores in: useSiteStore (Pinia)
→ Sets cookie: 'context' for subsequent requests
```

### 2. Page Rendering (`middleware/02.bioland.global.js`)
```javascript
// Every route transition:
1. Validate locale prefix
2. Fetch page data: GET /api/page/{key}/{path}
3. Fetch menus: GET /api/menus (if not cached)
4. Store in usePageStore, useMenusStore
```

### 3. Drupal Integration (`server/utils/drupal/`)
```javascript
// Authentication (useDrupalLogin)
const $http = await useDrupalLogin(siteCode);
// Returns SuperAgent instance with active session

// JSON:API requests pattern
const uri = `${localizedHost}/jsonapi/{type}/{bundle}`;
await $fetch(uri, { query: { jsonapi_include: 1 } });
```

## Caching Strategy (Nitro Storage)

**Multi-level cache with different TTLs** defined in `server/utils/cache.js`:

```javascript
// Cache configurations
pageCache     → 30 days   (base: 'pages')
menusCache    → 30 days   (base: 'menus')  
contextCache  → 30 days   (base: 'context')
externalCache → 6 months  (base: 'external')
listCache     → 2.5 days  (base: 'lists')
forumsCache   → 2.5 hours (base: 'forums')
commentCache  → 1 day     (base: 'comments')

// Usage in API routes
export default cachedEventHandler(async (event) => {
  // handler logic
}, menusCache);

// Cache invalidation via headers
'Clear-Cache': key          // Single item
'Clear-All-Cache': 'true'   // Full store
'No-Cache': key             // Bypass specific cache
```

**Storage locations:**
- Dev: `.nuxt/data/{storeName}/`
- Prod: `./cache/{storeName}/`

## Development Commands

```bash
# Development (cleans cache, runs on be.localhost:3000)
yarn dev

# Build
yarn build

# Preview production
yarn preview

# Clean cache manually
yarn clean
```

**Important:** Development uses `be.localhost` for proper multi-site testing.

## File Naming & Structure

- **Components:** `PascalCase.vue` (auto-imported)
- **Composables:** `kebab-case.js` in `composables/` (auto-imported, must use Vue APIs)
- **Utilities:** `kebab-case.js` in `utils/` (pure functions, no Vue context)
- **Stores:** `kebab-case.js` in `stores/` (Pinia stores)
- **Server routes:** Follow Nuxt conventions (`[param].get.js`, `index.post.js`)

## Key Patterns

### 1. Menu System
Multiple menu types loaded into `useMenusStore`:
```javascript
// Available menus
main, footer, footerCredits, languages, nr, nrSix, 
nbsap, nfps, bch, absch, contentTypes, forums, systemPages
```

### 2. Type Transformations
Drupal uses `snake_case`, frontend uses `camelCase`:
```javascript
import { camelCase } from 'change-case/keys';
const cleaned = camelCase(drupalData);
```

### 3. Locale Handling
```javascript
// Path prefixes: /en/page-path
// Strategy: 'prefix' (configured in nuxt.config.ts)
// RTL languages: ['am', 'ar', 'az', 'he', 'fa', 'ur', 'mv', 'ku']
```

### 4. Error Handling
```javascript
// Server routes - consistent error passing
try {
  // logic
} catch (e) {
  passError(event, e);  // From server utils
}
```

## Common Gotchas

1. **Never manually import components/composables** - Nuxt auto-imports them
2. **Always use parsed context** - `parseContext(context)` adds host URLs, path prefixes
3. **Check for localization exceptions** - Some paths like `/sites/` bypass locale prefixes
4. **Cache keys include full context** - siteCode, locale, env, path all factor in
5. **Drupal auth is per-siteCode** - Sessions cached in `$http[cacheId]`
6. **Menus load all types at once** - Single `/api/menus` call aggregates 10+ sources

## Testing Context

When adding tests (see `.github/old.md` for full TDD guide):
- **Unit tests:** `tests/unit/` (Vitest)
- **Component tests:** `tests/components/` (Vitest + @vue/test-utils)
- **E2E tests:** `tests/e2e/` (Playwright)

## External Dependencies

- **DMSM API:** Site configurations (`{dmsm}/config/{env}/{multiSiteCode}/{siteCode}`)
- **Drupal JSON:API:** Content (`{localizedHost}/jsonapi/...`)
- **Index API:** Search/aggregation (`$indexFetch()` from server utils)

## Key Files to Reference

- `server/utils/context.js` - Context parsing/creation
- `server/utils/cache.js` - All cache configurations
- `plugins/site.js` - Initial context loading
- `middleware/02.bioland.global.js` - Route middleware logic
- `server/utils/drupal/drupal-auth.js` - Drupal authentication
- `nuxt.config.ts` - Full app configuration
 
 ## Jira Issue Management
- **CRITICAL**: Every Jira issue MUST be linked to an epic
- When creating issues, use `jira_link_to_epic` command immediately after creation
- The `parent` field in `additional_fields` does NOT work for epic linking
- Default epic for infrastructure/development tasks: **BL-460**
- Example workflow:
  1. Create issue: `jira_create_issue` → returns BL-XXX
  2. Link to epic: `jira_link_to_epic` with `epic_key: "BL-460"` and `issue_key: "BL-XXX"`
  3. Verify linkage in response

Bulding docker 


docker build --platform linux/amd64 -t scbd/bioland-head:${env}-${date}-v${numberAtThisTag}.