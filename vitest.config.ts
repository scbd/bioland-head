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
      // D14: extended for p01-01 — server/utils/thesaurus/index.js is .js (outside the
      // *.ts glob above) and server/api/thesaurus/[termIdentifier]/index.ts lives under
      // server/api, not server/utils. Both changed for the title/name localization fix.
      include: [
        'server/utils/**/*.ts',
        'server/utils/thesaurus/index.js',
        'server/api/thesaurus/[[]termIdentifier[]]/index.ts',
        'shared/utils/**/*.ts',
        'app/utils/resolve-theme.js',
        'app/composables/use-term-label.js',
        // p02-04: covers only the matching/exclusion logic; the straight-line HTTP-fetch
        // call in main() is excluded from the coverage denominator (see task doc D14 note).
        'scripts/thesaurus/build-iso2-country-map.mjs',
        // p02-03: the discovery-method fallback and unmapped-partition branches are real
        // branching logic per D14/the task's own testing note, not a pure straight-line fetch
        // loop, so they are measured rather than excluded — see the script's own test file.
        'scripts/thesaurus/build-sdg-alias-map.mjs',
        // p02-05: the classification, alias, gap and resume logic is all exported and measured;
        // the live-HTTP `main()` entrypoint carries its own `v8 ignore` block per D14's note.
        'scripts/thesaurus/classify-resolvable-keys.mjs',
        // p03-05: the plan/archive/promote/apply logic is all exported and measured; only the
        // real-filesystem `main()` wiring carries a `v8 ignore` block, same pattern as p02-05.
        'scripts/i18n/remove-resolved-locale-keys.mjs'
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
