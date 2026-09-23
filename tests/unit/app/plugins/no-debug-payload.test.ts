import { describe, expect, it } from 'vitest'
import { globSync } from 'glob'
import { resolve } from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const appPluginsDir = resolve(__dirname, '../../../../app/plugins')

describe('app/plugins – no debug payload plugin', () => {
  it('should not have any debug-payload* files', () => {
    const debugPayloadFiles = globSync('**/debug-payload*', {
      cwd: appPluginsDir,
    })
    expect(debugPayloadFiles).toHaveLength(0)
  })
})
