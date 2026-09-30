import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../../../app/components/page/header/mega-menu/login.vue', import.meta.url), 'utf8')

describe('mega-menu login button icon', () => {
  it('binds the Drupal icon colour to the same contrast colour as the button text', () => {
    expect(source).toMatch(/<LazyIcon name="drupal" :color="loginLinkStyle\.color"/)
    expect(source).not.toMatch(/<LazyIcon name="drupal" color="#ffffff"/)
  })
})
