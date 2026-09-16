import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Keep Vitest scoped to unit tests. E2E specs live under tests/e2e and
    // are executed by Playwright (yarn test:e2e), not Vitest.
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // D14: a task adding code outside this glob extends it with the specific path it owns, never a
      // tree-wide widening — p02-02 adds its own new route family here.
      // D14: extended for p01-01 — server/utils/thesaurus/index.js is .js (outside the
      // *.ts glob above) and server/api/thesaurus/[termIdentifier]/index.ts lives under
      // server/api, not server/utils. Both changed for the title/name localization fix.
      include: [
        'server/utils/**/*.ts',
        'server/utils/thesaurus/index.js',
        'server/api/thesaurus/[[]termIdentifier[]]/index.ts',
        'shared/utils/**/*.ts',
        'app/utils/resolve-theme.js',
        'server/api/thesaurus/terms/**/*.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
      '~/': resolve(__dirname, './'),
      // Nuxt's built-in alias for the shared/ layer, mirrored so specs can import
      // modules that use it (e.g. server/plugins/00.assert-public-runtime-config.ts).
      '#shared': resolve(__dirname, './shared')
    }
  }
})
