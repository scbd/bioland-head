import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Keep Vitest scoped to unit tests. E2E specs live under tests/e2e and
    // are executed by Playwright (yarn test:e2e), not Vitest.
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    // Type-level specs (*.test-d.ts) are compiled by tsc, not executed. Without this block
    // `expectTypeOf` is a runtime no-op and its it() bodies report green while asserting nothing.
    typecheck: {
      enabled: true,
      include: ['tests/unit/**/*.test-d.ts'],
      tsconfig: './tsconfig.vitest.json',
      // Errors in ordinary source files are reported but do not fail the run. This repo has no
      // repo-wide typecheck gate yet (tracked as debt in p04-04) and carries pre-existing source
      // errors; type errors INSIDE the test-d files still fail, which is the gate this adds.
      ignoreSourceErrors: true
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/utils/**/*.ts', 'shared/utils/**/*.ts', 'app/utils/resolve-theme.js']
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
