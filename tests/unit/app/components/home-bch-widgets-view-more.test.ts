import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('BL-797: Home page widgets View more translations and component bindings', () => {
  describe('translation keys', () => {
    const enLocale = JSON.parse(
      readFileSync(new URL('../../../../i18n/locales/en.json', import.meta.url), 'utf8')
    )
    const frLocale = JSON.parse(
      readFileSync(new URL('../../../../i18n/locales/fr.json', import.meta.url), 'utf8')
    )

    it('defines expected English translation keys for all three widgets', () => {
      expect(enLocale['View more on the National Biosafety Framework']).toBe(
        'View more on the National Biosafety Framework'
      )
      expect(enLocale['View more news and updates']).toBe('View more news and updates')
      expect(enLocale['View more resources']).toBe('View more resources')
    })

    it('defines expected French translations for all three widgets', () => {
      expect(frLocale['View more on the National Biosafety Framework']).toBe(
        'En savoir plus sur le Cadre national de prévention des risques biotechnologiques'
      )
      expect(frLocale['View more news and updates']).toBe(
        'En savoir plus sur les actualités et les mises à jour'
      )
      expect(frLocale['View more resources']).toBe('En savoir plus sur les ressources')
    })
  })

  describe('component source assertions', () => {
    it('home-bch.vue passes viewMoreText to SwiperContentType', () => {
      const source = readFileSync(
        new URL('../../../../app/components/page/home-bch.vue', import.meta.url),
        'utf8'
      )
      expect(source).toMatch(/:viewMoreText="\$t\(['"]View more on the National Biosafety Framework['"]\)"/)
    })

    it('content-type/index.vue declares viewMoreText prop and falls back to View more', () => {
      const source = readFileSync(
        new URL('../../../../app/components/swiper/content-type/index.vue', import.meta.url),
        'utf8'
      )
      expect(source).toMatch(/viewMoreText:\s*\{\s*type:\s*String,\s*default:\s*null\s*\}/)
      expect(source).toMatch(/viewMoreText\s*\|\|\s*t\(['"]View more['"]\)/)
    })

    it('bch-news.vue uses View more news and updates translation key', () => {
      const source = readFileSync(
        new URL('../../../../app/components/swiper/bch-news.vue', import.meta.url),
        'utf8'
      )
      expect(source).toMatch(/t\(['"]View more news and updates['"]\)/)
    })

    it('bch-resources.vue uses View more resources translation key', () => {
      const source = readFileSync(
        new URL('../../../../app/components/swiper/bch-resources.vue', import.meta.url),
        'utf8'
      )
      expect(source).toMatch(/t\(['"]View more resources['"]\)/)
    })
  })
})
