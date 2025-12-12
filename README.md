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
yarn analyze          # Bundle analysis
```

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

