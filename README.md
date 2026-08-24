# Bioland Head

Multi-site headless CMS frontend serving hundreds of CBD (Convention on Biological Diversity) websites from a single Nuxt.js 4 codebase, powered by Drupal 11 as the backend.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser       │────▶│  Nuxt.js 4      │────▶│  Drupal 11      │
│   (Vue 3)       │     │  (SSR/Nitro)    │     │  (JSON:API)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  AWS CloudFront │
                        │  (CDN Cache)    │
                        └─────────────────┘
```

### Key Concepts

- **Context-Driven**: Every request is scoped by `siteCode`, `locale`, and `environment`
- **Multi-Site**: Single deployment serves 100+ country/regional sites
- **Headless CMS**: Drupal provides content via JSON:API, Nuxt handles presentation
- **CDN Caching**: CloudFront respects `Cache-Control` headers set by server middleware

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Nuxt.js 4, Pinia |
| Styling | Bootstrap 5, SCSS |
| Backend | Drupal 11 (JSON:API) |
| Server | Nitro (SSR + API routes) |
| CDN | AWS CloudFront |
| i18n | @nuxtjs/i18n (80+ locales) |
| Testing | Vitest, Playwright |
| Build | Docker, Node 20+ |

## Quick Start

### Prerequisites

- Node.js 20+
- Yarn
- Add to `/etc/hosts`: `127.0.0.1 be.localhost`

### Installation

```bash
# Install dependencies
yarn install

# Start development server (be.localhost:3000)
yarn dev

# Build for production
yarn build

# Preview production build
yarn preview
```

### Development URLs

| Environment | URL |
|-------------|-----|
| Local Dev | `http://be.localhost:3000/en` |
| Staging | `https://be.stg.chm-cbd.net/en` |
| Production | `https://be.chm-cbd.net/en` |

## Project Structure

```
bioland-head/
├── app/
│   ├── components/       # Vue components (auto-imported)
│   ├── composables/      # Vue composables (auto-imported)
│   ├── layouts/          # Page layouts
│   ├── middleware/       # Route middleware
│   ├── pages/            # File-based routing
│   ├── plugins/          # Nuxt plugins
│   ├── stores/           # Pinia stores
│   └── utils/            # Client-side utilities
├── server/
│   ├── api/              # API routes
│   ├── middleware/       # Server middleware (cache-control, etc.)
│   ├── plugins/          # Server plugins
│   └── utils/            # Server utilities
│       ├── context.js    # Context parsing
│       └── drupal/       # Drupal integration
├── shared/
│   ├── types/            # Shared TypeScript types
│   └── utils/            # Utilities shared between client/server
├── i18n/
│   └── locales/          # Translation files (80+ languages)
├── configs/              # App configurations
├── public/               # Static assets
└── tests/
    └── unit/             # Vitest unit tests
```

## Context System

Every operation is scoped by context:

```javascript
{
  env: 'dev' | 'stg' | 'prod',
  siteCode: 'be',              // Belgium site
  locale: 'en',                // English locale
  host: 'https://be.chm-cbd.net',
  localizedHost: 'https://be.chm-cbd.net/en'
}
```

### Getting Context

```javascript
// In server routes
export default defineEventHandler(async (event) => {
  const context = getContext(event);
  const parsed = parseContext(context);
  // Use parsed.siteCode, parsed.locale, etc.
});

// In components (via Pinia)
const siteStore = useSiteStore();
const { siteCode, locale } = siteStore;
```

## Caching (CloudFront)

Caching is controlled via `Cache-Control` headers set in `server/middleware/cache-control.js`. AWS CloudFront respects these headers for CDN-level caching.

### Cache Rules

| Route Pattern | Cache-Control | Purpose |
|---------------|---------------|---------|
| `/api/me`, `/api/comments/*`, `/api/forums/*/*` | `no-store, max-age=0` | User-specific, real-time data |
| `/_nuxt/*`, static assets (`.js`, `.css`, `.png`, etc.) | `max-age=31536000` (1 year) | Immutable build artifacts |
| All other routes | `max-age=15, stale-while-revalidate=86400` | Dynamic content with revalidation |

### Cache Behavior

```javascript
// Assets & Nuxt bundles: Cached for 1 year (immutable)
Cache-Control: max-age=31536000, stale-if-error=604800

// Dynamic pages: Short cache with background revalidation
Cache-Control: max-age=15, stale-if-error=604800, stale-while-revalidate=86400

// User data & forums: Never cached
Cache-Control: no-store, max-age=0
```


## Scripts

```bash
yarn dev              # Development server
yarn build            # Production build
yarn preview          # Preview production
yarn clean            # Clear Nuxt cache
yarn test             # Run tests (watch mode)
yarn test:run         # Run tests once
yarn test:coverage    # Run with coverage
yarn test:e2e         # Run Playwright E2E tests
yarn test:e2e:ui      # Run Playwright E2E tests (UI)
yarn test:e2e:report  # Open the latest Playwright HTML report
yarn analyze          # Bundle analysis
```

## End-to-end Testing (Playwright)

This repo uses Playwright with role-based authentication fixtures that apply **staging Drupal cookies** to the **local dev server**.

### How Auth Works

```
Staging Drupal                     Local Dev Server
(NUXT_E2E_DRUPAL_URL)      →      (NUXT_E2E_LOCAL_URL)
         │                              │
    1. Login as role                    │
         │                              │
    2. Extract SSESS* cookie            │
         │                              │
    3. Save cookie ──────────────────→  4. Apply to local tests
```

**Benefits:**
- ✅ No need to create local test users
- ✅ Use real staging roles and permissions
- ✅ Same authentication as production
- ✅ Fast test execution (no repeated logins)

### Quick Setup

> **A root `.env` is mandatory before `yarn test:e2e` will run at all.** A fresh clone or a new git
> worktree does not have one (`.env` is git-ignored), and without it the Playwright `webServer`
> still binds its port while every request fails with
> `getSiteSettings cache key missing required context: env=, multiSiteCode=`. Playwright surfaces
> that only as a 120-second `webServer` timeout, which hides the real cause.
>
> `NUXT_PUBLIC_ENV`, `NUXT_PUBLIC_MULTI_SITE_CODE`, and `NUXT_PUBLIC_BASE_HOST` default to `""` in
> `nuxt.config.ts` with no fallback, so they must come from the environment. The committed
> `.env.example` already carries working values for all three:
>
> ```bash
> cp .env.example .env   # then fill in the API credentials
> ```
>
> `playwright.config.ts` now checks this up front and fails immediately, naming the missing
> variables, instead of timing out.

1. **Configure `.env`** (see `.env.example` for template):
   ```bash
   NUXT_E2E_DRUPAL_URL=<your_staging_url>
   NUXT_E2E_LOCAL_URL=<your_local_url>
   NUXT_E2E_USER_PASSWORD=<password>
   NUXT_E2E_USER_SCBD_STAFF=<username>
   NUXT_E2E_USER_SITE_MANAGER=<username>
   NUXT_E2E_USER_CONTENT_MANAGER=<username>
   NUXT_E2E_USER_CONTRIBUTOR=<username>
   NUXT_E2E_USER_AUTHENTICATED=<username>
   ```

2. **Run auth setup** (extracts staging cookies for local use):
   ```bash
   yarn test:e2e:auth-setup
   ```

3. **Start local dev server**:
   ```bash
   yarn stg-open-bsl-e2e
   ```

4. **Run tests**:
   ```bash
   yarn test:e2e
   ```

### Available Auth Fixtures

| Fixture | Role | Access Level |
|---------|------|-------------|
| `scbdStaff` | SCBD Staff | Full admin |
| `siteManager` | Site Manager | Restricted |
| `contentManager` | Content Manager | Restricted |
| `contributor` | Contributor | Restricted |
| `authenticated` | Authenticated User | Basic |
| `anonymous` | Anonymous | Public |

### Usage in Tests

```typescript
import { test, expect } from '../../fixtures/auth'

// Staging cookie automatically applied!
test('content manager test', async ({ page, contentManager }) => {
  await page.goto('/en/about')
  // User has content_manager role from staging
})
```

### Running Tests

```bash
# Run all tests
yarn test:e2e

# Run specific test file
yarn test:e2e -- tests/e2e/bl-576-bsl/BL-581/BL-581.spec.ts

# Run with specific E2E target (BSL site with real content)
E2E_TARGET=bsl yarn test:e2e

# Run with UI
yarn test:e2e:ui

# View latest report
yarn test:e2e:report
```

**Note:** Use `--` when passing Playwright CLI args with Yarn Berry.

**Important:** Tests in `bl-576-bsl/` should run against the BSL target (`E2E_TARGET=bsl`) which has actual content. The default `e2e` target is for development and may not have all required content.

### Troubleshooting

**Auth setup fails:**
```bash
# Check staging is accessible
curl -I "$NUXT_E2E_DRUPAL_URL"

# Verify .env variables
grep NUXT_E2E .env
```

**Tests fail with "storageState: file does not exist":**
```bash
# Re-run auth setup
yarn test:e2e:auth-setup
```

**Sessions expire:**
```bash
# Refresh staging cookies
yarn test:e2e:auth-setup
```

### Documentation

- **Quick Start:** `tests/e2e/QUICK-START.md`
- **Auth System:** `tests/e2e/AUTH-SETUP-SUMMARY.md`
- **Auth Fixtures:** `tests/e2e/fixtures/README.md`

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | kebab-case | `user-profile.vue` |
| Composables | kebab-case | `use-auth.js` |
| Utilities | kebab-case | `format-date.js` |
| Stores | kebab-case | `site.js` |
| Server routes | Nuxt convention | `[id].get.js` |

## Key Files

| File | Purpose |
|------|---------|
| `server/utils/context.js` | Context parsing/creation |
| `server/utils/cache.js` | Cache configurations |
| `plugins/site.js` | Initial context loading |
| `middleware/02.bioland.global.js` | Route middleware |
| `server/utils/drupal/drupal-auth.js` | Drupal authentication |
| `nuxt.config.ts` | App configuration |

## RTL Support

Supported RTL languages: `am`, `ar`, `az`, `he`, `fa`, `ur`, `mv`, `ku`

## Docker

```bash
# Build image
docker build --platform linux/amd64 -t scbd/bioland-head:dev-$(date +%Y-%m-%d) .

# Run container
docker run -p 3000:3000 scbd/bioland-head:dev-2025-12-12
```

## Contributing

1. Create feature branch from `nuxt4`
2. Follow file naming conventions (kebab-case for all files)
3. Write tests for new functionality
4. Submit PR with clear description

## License

See [LICENSE](LICENSE) file.

