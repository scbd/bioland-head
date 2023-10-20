// https://nuxt.com/docs/api/configuration/nuxt-config
import { viteSyncI18nFiles } from './i18n/sync-i18n';
import locales from './i18n/locales';

const css  =   [ '@/assets/custom.scss' ]

export default defineNuxtConfig({
  devtools: { enabled: true },
  debug: true, 
  css,
  runtimeConfig:{
    public: {
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
    '@pinia/nuxt'
  ],
  viewport: {
    breakpoints: {
      xs: 300,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
      xxl: 1400
    },

    defaultBreakpoints: {
      desktop: 'lg',
      mobile: 'sm',
      tablet: 'md',
    },

    fallbackBreakpoint: 'lg'
  },
  i18n: { locales,
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
    
      resolve: {
          alias: {
              'vue-i18n': 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js'
          }
      },
      plugins: [
          viteSyncI18nFiles()
      ]
  }

})
