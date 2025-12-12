import locales from './i18n/locales'        ;
import en      from './i18n/locales/en.json';
import domains from './configs/domains'     ;
import cookieControl from './configs/cookie-control';
import { LOG_LEVEL } from './shared/utils/constants';

const css   =   [ '~/assets/custom.scss', 'vue-final-modal/style.css' ]

const resolveLogLevel = () => {
  const envValue = process.env.NUXT_PUBLIC_LOG_LEVEL?.trim().toUpperCase();
  if (envValue && Object.prototype.hasOwnProperty.call(LOG_LEVEL, envValue)) {
    return LOG_LEVEL[envValue];
  }

  return LOG_LEVEL.TRACE;
};

const resolvedLogLevel = resolveLogLevel();
  
export default defineNuxtConfig({
  devtools: { enabled: false },
  debug: false,
  watch: [
    "~/app/components/**/*", // Watches all .js files in the 'custom' directory within the project root
    "~/server/api/**/*", // Watches all .ts files in subdirectories of 'server/api'
    "~/server/utils/**/*", // Watches all .ts files in subdirectories of 'server/utils'
    "~shared/**/*",
  ],
  sourcemap: { server: true, client: true },
  logLevel: "verbose",
  css,
  app: {
    pageTransition: { name: "page", mode: "out-in" },
    head: {
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=.80" },
      ],
    },
  },
  runtimeConfig: {
    apiUser: process.env.API_USER,
    apiUserPass: process.env.API_USER_PASS,
    apiKey: process.env.API_KEY,
    panoramaKey: process.env.PANORAMA_KEY,
    jiraToken: process.env.JIRA_TOKEN,
    // AWS Translate Configuration
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    // i18n Cache Database Configuration
    i18nDbHost: process.env.I18N_DB_HOST,
    i18nDbPort: process.env.I18N_DB_PORT ? parseInt(process.env.I18N_DB_PORT) : 3306,
    i18nDbUser: process.env.I18N_DB_USER,
    i18nDbPassword: process.env.I18N_DB_PASSWORD,
    i18nDbName: process.env.I18N_DB_NAME || 'i18n_cache',
    i18nDbConnectionLimit: process.env.I18N_DB_CONNECTION_LIMIT ? parseInt(process.env.I18N_DB_CONNECTION_LIMIT) : 5,
    public: {
      isLocalHost:
        process.env.NUXT_PUBLIC_IS_LOCAL_HOST === "true" ? true : false,
      showBl1Link:
        process.env.NUXT_PUBLIC_SHOW_BL1_LINK === "true" ? true : false,
      locales,
      baseURL: "",
      env: "",
      baseHost: "",
      multiSiteCode: "",
      gaiaApi: "https://api.cbd.int/api",
      dmsm: "https://dmsm.cbddev.xyz/api",
      logAll: process.env.NUXT_PUBLIC_LOG_ALL === "true" ? true : false,
      logServerOutRequests:
        process.env.NUXT_PUBLIC_LOG_SERVER_OUT_REQUESTS === "true"
          ? true
          : false,
      logApi: process.env.NUXT_LOG_API === "true" ? true : false,
      logLevel: resolvedLogLevel,
    },
  },
  imports: {
    presets: [
      // { from: "consola", imports: ["consola"] },
      { from: "vue-final-modal", imports: ["useModal"] },
    ],
  },
  modules: [
    "@nuxtjs/i18n",
    "@nuxtjs/leaflet",
    "@nuxt/devtools",
    "nuxt-viewport",
    "@pinia/nuxt", // '@pinia-plugin-persistedstate/nuxt',
    "@nuxt/image",
    "nuxt-delay-hydration",
    "nuxt-swiper",
    "nuxt-gravatar",
    "nuxt-emoji-picker",
    "@nuxtjs/google-fonts", // '@nuxt/test-utils/module',
    // '@nuxt/scripts',
    "@dargmuesli/nuxt-cookie-control",
    "@nuxt/scripts",
    "nuxt-schema-org",
  ],
  schemaOrg: {
    // Reactive identity - will be set dynamically per site/locale
    reactive: true,
  },
  cookieControl,
  piniaPersistedstate: {
    cookieOptions: { sameSite: "strict" },
    storage: "cookies",
  },
  viewport: {
    breakpoints: { xs: 1, sm: 752, md: 992, lg: 1330, xl: 1600 },
    defaultBreakpoints: {
      desktop: "lg",
      mobile: "sm",
      tablet: "md",
    },
    fallbackBreakpoint: "lg",
  },
  i18n: {
    locales,
    debug: false,
    defaultLocale: "en",
    fallbackLocale: "en",
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || "https://www.cbd.int", // Set dynamically via plugin (app/plugins/i18n-base-url.js)
    locale: "en",
    detectBrowserLanguage: false, // CRITICAL: Disabled to let DMSM control default locale
    precompile: { strictMessage: false },
    lazy: true,
    langDir: "locales",
    strategy: "prefix",
    bundle: {
      optimizeTranslationDirective: false,
    },
    compilation: {
      strictMessage: false,
    },
  },
  vite: {
    server: {
      hmr: { protocol: "ws", host: "localhost", clientPort: 3000 },
    },
    optimizeDeps: {
      include: ["string-strip-html", "@unhead/schema-org/vue"],
    },
  },
  delayHydration: { mode: "init" },

  image: {
    domains: [
      "portal.geobon.org",
      "chm-cbd.net",
      "be.bl2.chm-cbd.net",
      "lk.bl2.cbddev.xyz",
      "acb.bl2.cbddev.xyz",
      "be.bl2.cbddev.xyz",
      "cbd.int",
      "www.cbd.int",
      "https://panorama.solutions/",
      "https://scbd.atlassian.net",
      ...domains,
    ],
    format: ["webp", "avif", "jpeg", "jpg", "png", "gif"],
    quality: 50,
    screens: { xs: 320, sm: 552, md: 992, lg: 1330, xl: 1600 },
  },
  nitro: {
    logLevel: resolvedLogLevel,
    experimental: { tasks: true },
    devStorage: {
      db: { driver: "fs", base: "./.nuxt/data/db" },
      comments: { driver: "fs", base: "./.nuxt/data/comments" },
      pages: { driver: "fs", base: "./.nuxt/data/pages" },
      context: { driver: "fs", base: "./.nuxt/data/context" },
      lists: { driver: "fs", base: "./.nuxt/data/lists" },
      forums: { driver: "fs", base: "./.nuxt/data/forums" },
      external: { driver: "fs", base: "./.nuxt/data/external" },
      menus: { driver: "fs", base: "./.nuxt/data/menus" },
      gbfTargets: { driver: "fs", base: "./.nuxt/data/gbf-targets" },
    },
    storage: {
      db: { driver: "fs", base: "./cache/db" },
      comments: { driver: "fs", base: "./cache/comments" },
      pages: { driver: "fs", base: "./cache/pages" },
      context: { driver: "fs", base: "./cache/context" },
      lists: { driver: "fs", base: "./cache/lists" },
      forums: { driver: "fs", base: "./cache/forums" },
      external: { driver: "fs", base: "./cache/external" },
      menus: { driver: "fs", base: "./cache/menus" },
      gbfTargets: { driver: "fs", base: "./cache/gbf-targets" },
    },
  },
  experimental: {
    restoreState: true,
    clientFallback: true,
    sharedPrerenderData: true,
    scanPageMeta: true,
    cookieStore: true,
  },
  googleFonts: {
    families: {
      Roboto: [300, 400, 500, 700, 900],
    },
  },
  //  build: {
  //   transpile: ['@atlaskit/adf-schema','@atlaskit/editor-prosemirror']
  // },
  compatibilityDate: "2024-09-08",
  alias: {
    "typesense-instantsearch-adapter":
      "typesense-instantsearch-adapter/src/TypesenseInstantsearchAdapter.js",
  },
});
