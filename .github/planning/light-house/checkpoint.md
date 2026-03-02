# Checkpoint

**Current phase:** Phase 02 complete  
**Last completed:** `phase-02/p02-02-third-party-cookies.md`  
**Next task:** `phase-03/p03-01-hero-lcp-optimization.md`  
**Updated:** 2026-03-02T00:00:00Z

## State

- Phase 01 complete: all link-name, image-alt, unsized-images, target-size, heading-order, and crawlable-anchors fixes applied
- Phase 02 p02-01 complete: badge color contrast utility and dynamic text color
- Phase 02 p02-02 complete: third-party cookie elimination via flag URL centralization
- Branch: p02-02-third-party-cookies (contains p02-02 commits on top of p02-01 work)
- Ready to begin Phase 03

## Notes

- p01-01: 7 files changed — footer alt+dimensions, card aria-labels, gbf-icon aria-hidden, header :alt→:aria-label, swiper bullet sizing, i18n keys
- p01-02: 4 files changed — card h5/h6→p.h5/p.h6, mega-menu button for dropdown triggers
- p02-01: 2 files changed — new app/utils/color-contrast.js (parseColor, relativeLuminance, contrastTextColor), updated app/composables/theme.js (badge styles use computed text color via contrastTextColor)
- p02-02: 6 files changed — new app/utils/flag-url.js (getFlagUrl utility), updated site.js, nt7.vue, body-tags-date.vue, country-tab-selector.vue, country-tab.vue to use getFlagUrl(); all already use <NuxtImg> so IPX proxying eliminates third-party cookies
