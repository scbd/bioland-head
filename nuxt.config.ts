// https://nuxt.com/docs/api/configuration/nuxt-config
import { viteSyncI18nFiles } from './i18n/sync-i18n';
import locales from './i18n/locales';

const css  =   [ '@/assets/custom.scss' ]

const routeRules = {
  // Cached for 1 hour
  // '/api/facets/bch': { cache: { maxAge: 60 * 60 * 24 } },
  // '/api/facets/absch': { cache: { maxAge: 60 * 60 * 24 } },
  // '/api/nbsap/*': { cache: { maxAge: 60 * 60 * 24 * 30 } },
  // '/api/nr/*': { cache: { maxAge: 60 * 60 * 24 * 30} },
  // '/api/nr6/*': { cache: { maxAge: 60 * 60 * 24 * 30 } },
  '/api/context/**': { cache: { maxAge:  60 * 60 } },
}

export default defineNuxtConfig({
  devtools: { enabled: true },
  debug: false, 
  sourcemap: {
    server: true,
    client: true
  },
  css,

  runtimeConfig:{
    apiUser: process.env.API_USER,
    apiUserPass: process.env.API_USER_PASS,
    apiKey : process.env.API_KEY,
    public: {
      locales,
      baseURL: '',
      env: 'production',
      baseHost:'.chm-cbd.net',
      drupalMultisiteIdentifier: 'bl2',
      gaiaApi: 'https://api.cbd.int/api',
    }
  },
  imports: {
    presets: [
      {
        from: 'consola',
        imports: ['consola']
      }
    ]
  },
  modules: [
    'nuxt-viewport',
    '@nuxtjs/i18n-edge',
    '@pinia/nuxt',
    '@nuxt/image',
    'nuxt-delay-hydration',
    'nuxt-purgecss',
    'nuxt-swiper'
  ],
  viewport: {
    breakpoints: {
      xs: 1,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1250,
      xxl: 1400
    },

    defaultBreakpoints: {
      desktop: 'lg',
      mobile: 'sm',
      tablet: 'md',
    },

    fallbackBreakpoint: 'lg'
  },
  i18n: { 
    missingWarn: false, 
    fallbackWarn: false,
    silentTranslationWarn: true,
    locales,
    // locales: [
    //     { code: 'ar', iso: 'ar-SA',  dir: 'rtl' },
    //     { code: 'en', iso: 'en-US',             },
    //     { code: 'fr', iso: 'fr-FR',             },
    //     { code: 'es', iso: 'es-ES',             },
    //     { code: 'ru', iso: 'ru-RU',             },
    //     { code: 'zh', iso: 'zh-CN',             },
    // ],
    defaultLocale: 'en',
    fallbackLocale: 'en',
    // locale: 'en',
    detectBrowserLanguage : {
        alwaysRedirect: true,
    },
    // precompile: {
    //     strictMessage: false,
    // },
    // strictMessage: false,
    // escapeHtml:true,
    strategy: "prefix_except_default",
    // vueI18n:'./config/i18n.config.ts',
  },
  pinia: { autoImports: [ 'defineStore','useStore', 'storeToRefs'], },
  vite: {
      // resolve: {
      //     alias: {
      //         'vue-i18n': 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js'
      //     }
      // },
      plugins: [
          viteSyncI18nFiles()
      ]
  },
  delayHydration: {
    mode: 'init',
    // enables nuxt-delay-hydration in dev mode for testing
    debug: process.env.NODE_ENV === 'development'
  },
  purgecss: {
    enabled: false,//process.env.NODE_ENV !== 'development', // Always enable purgecss
    safelist: ['swiper'], // Add my-class token to the safelist (e.g. .my-class)
  },
  image: {
    domains: ['https://seed.chm-cbd.net', 'https://www.cbd.int', 'https://seed.bl2.staging.cbd.int'],
    format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif'],
    screens: {
      'xs': 320,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
      xxl: 1400,
      '2xl': 1400
    },
  },
  nitro: {
    logLevel: 4
    // routeRules
    // Production
    // storage: {
    //   db: {
    //     driver: 'fs',
    //     base: './data/db'
    //   }
    // },
    // Development
    // devStorage: {
    //   db: {
    //     driver: 'fs',
    //     base: './data/db'
    //   }
    // }
  }
})
