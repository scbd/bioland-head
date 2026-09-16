import { hydrateI18nCache } from '../utils/thesaurus/hydrate-i18n-cache';

export default defineNitroPlugin((nitro) => {
  // Warm the label:tr cache tier from MariaDB on boot, coordinated across containers so exactly
  // one hydrates (p04-02). Not awaited — never blocks startup; hydrateI18nCache never throws.
  // The `.catch` is defence in depth, not the primary guard: it protects boot even if that
  // contract is ever violated (e.g. a future edit reintroduces a throw before the try).
  hydrateI18nCache().catch((error) => {
    (typeof consola !== 'undefined' ? consola : console).warn?.(
      `[i18n-cache-hydrator] unexpected rejection outside hydrateI18nCache's own guard: ${error?.message ?? error}`
    );
  });
});
