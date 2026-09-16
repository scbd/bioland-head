import { hydrateI18nCache } from '../utils/thesaurus/hydrate-i18n-cache';

export default defineNitroPlugin((nitro) => {
  // Warm the label:tr cache tier from MariaDB on boot, coordinated across containers so exactly
  // one hydrates (p04-02). Not awaited — never blocks startup; hydrateI18nCache never throws.
  hydrateI18nCache();
});
