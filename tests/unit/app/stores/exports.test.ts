import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findExports } from 'mlly'
import { describe, expect, it } from 'vitest'

// @pinia/nuxt auto-imports everything unimport finds in app/stores. unimport scans each
// file with mlly's findExports, whose `export const` regex swallows a multi-line
// defineStore({ state, actions }) literal and reports object keys (actions, loading,
// value, ...) as extra declared exports, which then become global auto-imports.
// Keeping the stores on `const useXStore = ...` + `export { useXStore }` avoids that
// heuristic. This test fails the moment a store drifts back (BL-1178).
const storesDir = join(process.cwd(), 'app/stores')

describe('app/stores exports as seen by unimport', () => {
  for (const file of readdirSync(storesDir).filter((f) => /\.(js|ts)$/.test(f))) {
    it(`${file} exposes only its use*Store`, () => {
      const names = findExports(readFileSync(join(storesDir, file), 'utf8')).flatMap((e) => e.names)
      expect(names).toHaveLength(1)
      expect(names[0]).toMatch(/^use\w+Store$/)
    })
  }
})
