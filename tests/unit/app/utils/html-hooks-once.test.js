import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import DOMPurify from 'isomorphic-dompurify'

// The interactive flowchart node (co, nid 10076): its body wraps an editor-placeholder iframe in a <p>.
const body = readFileSync(new URL('./fixtures/bl-1223-node-10076-body.html', import.meta.url), 'utf8')

// isomorphic-dompurify caches its instance on globalThis, so this import shares the exact same
// DOMPurify object app/utils/html.js registers hooks on -- vi.resetModules() clears the module
// registry, not globalThis, which is the whole premise of the register-once fix under test.
//
// DOMPurify's registered-hook arrays aren't otherwise inspectable: removeHook(entryPoint) called
// with no function argument pops (and returns) the last hook, or undefined once the array is
// empty. Popping to exhaustion therefore drains and counts the array; push the popped hooks back
// on afterward, in their original order, so the shared instance is left as this test found it.
const countRegisteredHooks = (entryPoint) => {
  const popped = []
  let hook

  while ((hook = DOMPurify.removeHook(entryPoint)) !== undefined) popped.push(hook)
  for (let i = popped.length - 1; i >= 0; i--) DOMPurify.addHook(entryPoint, popped[i])

  return popped.length
}

describe('htmlSanitize hooks (BL-1223)', () => {
  // The server bundles app/utils/html.js twice (Vue app + Nitro via server/utils) over one shared
  // DOMPurify instance; each copy used to add its own hooks, so the iframe hook ran twice and threw.
  // A hang is not the failure mode here -- a re-registered hook throws immediately -- so no timeout
  // override is needed.
  it('sanitizes the flowchart body when the module is evaluated twice', async () => {
    const { htmlSanitize } = await import('../../../../app/utils/html')

    vi.resetModules()
    await import('../../../../app/utils/html')

    const result = htmlSanitize(body)

    expect(result).not.toContain('<iframe')
    expect(result).not.toContain('PASTE-FLOWCHART-URL-HERE')
    expect(result).toContain('Open the interactive flowchart in a new window')
  })

  // Re-evaluating the module (dev HMR editing the hook functions) must still leave exactly one
  // effective copy of each hook registered, not one-plus-stale-plus-new: output identical to a
  // single load proves there is no double-run left behind.
  it('leaves exactly one effective hook after the module is re-evaluated', async () => {
    const { htmlSanitize: sanitizeOnce } = await import('../../../../app/utils/html')
    const singleLoadResult = sanitizeOnce(body)

    vi.resetModules()
    const { htmlSanitize: sanitizeAfterReload } = await import('../../../../app/utils/html')
    const reloadedResult = sanitizeAfterReload(body)

    expect(reloadedResult).toBe(singleLoadResult)
  })

  // The two tests above no longer fail if the register-once/replace block is deleted outright:
  // the iframe hook is now null-safe, so running it two or three times over produces identical
  // output. Assert the hook-array length directly so removing that block regresses this test too.
  it('registers exactly one uponSanitizeElement and one afterSanitizeAttributes hook, even after repeated re-evaluation', async () => {
    await import('../../../../app/utils/html')
    vi.resetModules()
    await import('../../../../app/utils/html')
    vi.resetModules()
    await import('../../../../app/utils/html')

    expect(countRegisteredHooks('uponSanitizeElement')).toBe(1)
    expect(countRegisteredHooks('afterSanitizeAttributes')).toBe(1)
  })
})
