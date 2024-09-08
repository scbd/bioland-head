// https://nuxt.com/docs/api/configuration/nuxt-config

import locales from './i18n/locales';
import en from './i18n/locales/en.json';
import consola from 'consola'
const css  =   [ '@/assets/custom.scss', 'vue-final-modal/style.css' ]

const  routeRules = {
  '/sites/**': { proxy: 'https://mseed.bl2.cbddev.xyz', changeOrigin: true, prependPath: true}
}
export default defineNuxtConfig({
  // routeRules,
  devtools: { enabled: !['prod','production'].includes(process.env.ENV) },
  debug: false,
  sourcemap: { server: true, client: true }, 
  css,
  runtimeConfig:{
    apiUser     : process.env.API_USER,
    apiUserPass : process.env.API_USER_PASS,
    apiKey      : process.env.API_KEY,
    panoramaKey : process.env.PANORAMA_KEY,
    public: {
      isLocalHost:!!process.env.NUXT_IS_LOCAL_HOST,
      showBl1Link:!!process.env.NUXT_SHOW_BL1_LINK,
      locales,
      baseURL: '',
      env: 'production',
      baseHost:'.chm-cbd.net',
      multiSiteCode: 'bl2',
      gaiaApi: 'https://api.cbd.int/api',
      dmsm: 'https://dmsm.cbddev.xyz/api'
    }
  },

  imports: {
    dirs: ['stores'],
    presets: [ 
      { from: 'consola', imports: ['consola'] },
      { from: 'vue-final-modal', imports: ['useModal'] }
    ]
  },
  modules: [
    'nuxt-viewport',
    '@nuxtjs/i18n',
    '@pinia/nuxt',
    // '@pinia-plugin-persistedstate/nuxt',
    '@nuxt/image',
    'nuxt-delay-hydration',
    'nuxt-swiper',
    'nuxt3-leaflet',
    'nuxt-gravatar',
    'nuxt-emoji-picker',
    '@vue-final-modal/nuxt',
    
  ],
  // piniaPersistedstate: {
  //   cookieOptions: {
  //     sameSite: 'strict',
  //   },
  //   storage: 'cookies'
  // },
  viewport: {
    breakpoints: { xs: 1, sm: 752, md: 992, lg: 1330, xl: 1600 },

    defaultBreakpoints: {
      desktop: 'lg',
      mobile: 'sm',
      tablet: 'md',
    },

    fallbackBreakpoint: 'lg'
  },

  i18n: { 
    locales              ,
    debug                : false,
    messages             :{ en },
    defaultLocale        : 'en',
    fallbackLocale       : 'en',
    locale               : 'en',
    detectBrowserLanguage : { alwaysRedirect: true, },
    precompile           : { strictMessage: false, },
    lazy                 : true,
    langDir              : './i18n/locales',
    strategy             : "prefix",
  },
  vite: {
    server: {
      hmr: { protocol: 'ws', host: 'localhost', clientPort: 3000 },
    //   proxy: {
    //     '/sites/**': {
    //         target: 'https://mseed.bl2.cbddev.xyz',
    //         changeOrigin: true,
    //         prependPath: true
    //     },
    //  },
    }
  },
  delayHydration: {
    mode: 'init',
    debug: !['prod','production'].includes(process.env.ENV)
  },
  image: {
    domains: ['chm-cbd.net', 'cbd.int', 'https://panorama.solutions/'],
    format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif'],
    quality: 70,
    screens: {
      xs: 320,
      sm: 552,
      md: 992,
      lg: 1330,
      xl: 1600
    },
  },

  nitro: {
    logLevel: 4,

    // devProxy: {
    //   '/sites/**': {
    //       target: 'https://mseed.bl2.cbddev.xyz',
    //       changeOrigin: true,
    //       prependPath: true
    //   },
    // },
    devStorage: { db: { driver: 'fs', base: './.nuxt/data/db' } },
    storage: { db: { driver: 'fs', base: './cache/db' } }
  },
  experimental: {
    restoreState       : true,
    clientFallback     : true,
    sharedPrerenderData: true,
    scanPageMeta       : true,
    cookieStore        : true
  }
})