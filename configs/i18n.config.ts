import en from '../i18n/locales/en.json';
import fr from '../i18n/locales/en.json';
import locales from '../i18n/locales';

// console.log(locales)

export default defineI18nConfig(() => ({
  legacy: false,
  locales,
  locale:'en',
  defaultLocale: 'en',
  messages:{en},
  lazy: true,
  langDir: 'i18n',
  strategy: 'prefix',//prefix_except_default
  customBlocks: false,
  bundle:{runtimeOnly: true},
  debug: true
}))
