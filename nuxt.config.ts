// https://nuxt.com/docs/api/configuration/nuxt-config
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
      drupalMultisiteIdentifier: 'bl2'
    }
  },
  imports: {
    presets: [
      {
        from: 'consola',
        imports: ['consola']
      }
    ]
  }
})
