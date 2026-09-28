import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

// The interactive flowchart node (co, nid 10076): its body wraps an editor-placeholder iframe in a <p>.
const body = readFileSync(new URL('./fixtures/bl-1223-node-10076-body.html', import.meta.url), 'utf8')

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
})
