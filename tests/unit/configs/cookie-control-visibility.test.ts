import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import cookieControlConfig from '../../../configs/cookie-control.js'

describe('cookie control visibility configuration and component', () => {
  it('exports isCookieIdVisible as false in configs/cookie-control.js', () => {
    expect(cookieControlConfig.isCookieIdVisible).toBe(false)
  })

  it('does not contain targetCookieIds or "Cookie ids:" in app/components/custom-cookie-control.vue', () => {
    const componentSource = readFileSync(
      new URL('../../../app/components/custom-cookie-control.vue', import.meta.url),
      'utf8'
    )

    expect(componentSource).not.toContain('targetCookieIds')
    expect(componentSource).not.toContain('Cookie ids:')
  })
})
