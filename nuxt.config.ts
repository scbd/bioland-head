import locales from './i18n/locales'        ;
import en      from './i18n/locales/en.json';
import domains from './configs/domains'     ;

const css   =   [ '@/assets/custom.scss', 'vue-final-modal/style.css' ]

export default defineNuxtConfig({

  devtools: { enabled: false},
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
    '@nuxtjs/leaflet',
    '@nuxt/devtools',
    'nuxt-viewport',
    '@nuxtjs/i18n',
    '@pinia/nuxt',
    '@pinia-plugin-persistedstate/nuxt',
    '@nuxt/image',
    'nuxt-delay-hydration',
    'nuxt-swiper',
    'nuxt-gravatar',
    'nuxt-emoji-picker',
    '@nuxtjs/google-fonts'
  ],
  piniaPersistedstate: {
    cookieOptions: { sameSite: 'strict', },
    storage: 'cookies'
  },
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
    baseUrl              : '/en',
    messages             :{ en },
    defaultLocale        : 'en',
    fallbackLocale       : 'en',
    locale               : 'en',
    // detectBrowserLanguage : { alwaysRedirect: true, },
    precompile           : { strictMessage: false, },
    lazy                 : true,
    langDir              : '',
    strategy             : "prefix",
  },
  vite: {
    server: {
      hmr: { protocol: 'ws', host: 'localhost', clientPort: 3000 }
    }
  },
  delayHydration: { mode: 'init' },

  image: {
    domains: ['portal.geobon.org','chm-cbd.net','be.bl2.chm-cbd.net', 'cbd.int', 'www.cbd.int', 'https://panorama.solutions/', ...domains ],
    format: ['webp', 'avif', 'jpeg', 'jpg', 'png','gif'],
    quality: 50,
    screens: { xs: 320, sm: 552, md: 992, lg: 1330, xl: 1600 },
  },
  nitro: {
    logLevel: 4,
    devStorage: { 
      db       : { driver: 'fs', base: './.nuxt/data/db' },
      comments : { driver: 'fs', base: './.nuxt/data/comments' },
      pages    : { driver: 'fs', base: './.nuxt/data/pages' },
      context  : { driver: 'fs', base: './.nuxt/data/context' },
      lists    : { driver: 'fs', base: './.nuxt/data/lists' },
      forums   : { driver: 'fs', base: './.nuxt/data/forums' },
      external : { driver: 'fs', base: './.nuxt/data/external' },
      menus : { driver: 'fs', base: './.nuxt/data/menus' },
    },
    storage: { 
      db       : { driver: 'fs', base: './cache/db' },
      comments : { driver: 'fs', base: './cache/comments' },
      pages    : { driver: 'fs', base: './cache/pages' },
      context  : { driver: 'fs', base: './cache/context' },
      lists    : { driver: 'fs', base: './cache/lists' },
      forums   : { driver: 'fs', base: './cache/forums' },
      external : { driver: 'fs', base: './cache/external' },
      menus : { driver: 'fs', base: './cache/menus' },
    }
  },
  experimental: {
    restoreState       : true,
    clientFallback     : true,
    sharedPrerenderData: true,
    scanPageMeta       : true,
    cookieStore        : true
  },
  googleFonts: {
    families: {
      Roboto: [300,400,500,700,900]
    }
  },
  compatibilityDate: '2024-09-08',
})