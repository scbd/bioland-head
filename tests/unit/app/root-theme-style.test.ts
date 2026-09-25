import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../../../app/utils/resolve-theme'

// Execute the checked-in app.vue expression, not a hand-copied implementation (BL-952).
const source = readFileSync(new URL('../../../app/app.vue', import.meta.url), 'utf8')
const expression = source.match(/const rootThemeStyle = (\(\) => `[^`]*`);/)?.[1]
if (!expression) throw new Error('rootThemeStyle could not be located in app/app.vue')

const rootStyle = (config: unknown, authoredTheme?: unknown) => runInNewContext(
  `(${expression})()`,
  { siteStore: { primaryColor: resolveTheme(config as any, authoredTheme as any).color.primary } },
  { timeout: 100 },
)

describe('root --bs-primary follows the header colour', () => {
  it('is bound on the html element so global var(--bs-primary) accents inherit it', () => {
    expect(source).toMatch(/htmlAttrs: \{[^}]*style: rootThemeStyle/)
  })

  it('keeps the UN blue default for a site with no theme', () => {
    expect(rootStyle({})).toBe('--bs-primary: #009edb')
  })

  it('uses the network theme primary colour', () => {
    expect(rootStyle({ runTime: { theme: { color: { primary: '#fa6938' } } } })).toBe('--bs-primary: #fa6938')
  })

  it('uses the Drupal-authored primary colour over the network theme', () => {
    const config = { runTime: { theme: { color: { primary: '#fa6938' } } } }
    expect(rootStyle(config, { color: { primary: '#1f4e9c' } })).toBe('--bs-primary: #1f4e9c')
  })

  it('never emits an unvalidated colour into the style attribute', () => {
    const config = { runTime: { theme: { color: { primary: '#fa6938' } } } }
    expect(rootStyle(config, { color: { primary: 'red;background:url(x)' } })).toBe('--bs-primary: #fa6938')
  })
})
