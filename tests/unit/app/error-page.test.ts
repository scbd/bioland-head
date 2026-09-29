import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// Execute the checked-in error page's message logic, not a hand-copied implementation.
const source = readFileSync(new URL('../../../app/error.vue', import.meta.url), 'utf8')
const body = source.match(/const message = computed\(\(\) => ([\s\S]*?)\);\n/)?.[1]
if (!body) throw new Error('error.vue message computation could not be located')

const message = (error: { statusCode: number, statusMessage?: string }) => runInNewContext(
  `(${body})`,
  { props: { error }, t: (key: string) => (key === 'pageNotFound' ? 'Page not found' : key) },
  { timeout: 100 },
)

describe('error.vue message', () => {
  it('shows the translated not-found text for a 404, hiding the internal statusMessage', () => {
    expect(message({ statusCode: 404, statusMessage: 'Page not found for path: /en/x' })).toBe('Page not found')
  })

  it('keeps the existing statusMessage for a 500', () => {
    expect(message({ statusCode: 500, statusMessage: 'Internal Server Error' })).toBe('Internal Server Error')
  })

  it('falls back to the generic text when there is no statusMessage', () => {
    expect(message({ statusCode: 500 })).toBe('An error occurred')
  })
})
