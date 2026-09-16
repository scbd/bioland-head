import { expect, test } from '@playwright/test'

for (const explicitHero of [false, true]) {
  test(`hero follows ${explicitHero ? 'explicit Drupal hero colors' : 'the saved Drupal primary'}`, async ({ page }) => {
    await page.route('**/api/context/**', async (route) => {
      const response = await route.fetch()
      const context = await response.json()

      context.config.theme = {
        ...context.config.theme,
        hero: { primary: ['#7b6f82', '#CBB279'] },
      }
      context.biolandSettings = {
        ...context.biolandSettings,
        theme: {
          color: { primary: '#ff00e7' },
          ...(explicitHero ? { hero: { primary: ['#123456', '#abcdef'] } } : {}),
        },
      }

      await route.fulfill({
        status: response.status(),
        headers: Object.fromEntries(Object.entries(response.headers()).filter(
          ([name]) => !['content-encoding', 'content-length'].includes(name.toLowerCase()),
        )),
        contentType: 'application/json',
        body: JSON.stringify(context),
      })
    })

    await page.goto('/en', { waitUntil: 'domcontentloaded' })

    const hero = page.locator('#page-header-hero-image')
    const primary = explicitHero ? /rgb\(18, 52, 86\)/ : /rgb\(255, 0, 231\)/
    const secondary = explicitHero ? /rgb\(171, 205, 239\)/ : /rgb\(203, 178, 121\)/

    await expect(hero.locator('.hero-tint')).toHaveCSS('background-image', primary)
    await expect(hero.locator('.hero-tint')).toHaveCSS('background-image', secondary)
    await expect(hero.locator('.hero-overlay')).toHaveCSS('background-image', primary)
    await expect(hero.locator('.hero-overlay')).not.toHaveCSS('background-image', /rgb\(123, 111, 130\)/)
  })
}
