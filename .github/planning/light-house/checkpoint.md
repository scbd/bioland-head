# Checkpoint

**Current phase:** Phase 04 complete — ALL PHASES DONE  
**Last completed:** `phase-04/p04-01-hydration-mismatch.md`  
**Next task:** none — re-run Lighthouse audit to verify score improvements  
**Updated:** 2026-03-02T00:00:00Z

## State

- Phase 01 complete: all link-name, image-alt, unsized-images, target-size, heading-order, and crawlable-anchors fixes applied
- Phase 02 complete: badge color contrast + third-party cookie elimination
- Phase 03 complete: hero LCP optimization, CSS critical inlining, JS bundle reduction
- Phase 04 complete: hydration mismatch fixes via useSsrStableIndex composable
- Branch: p04-01-hydration-mismatch (final branch, contains all work)

## Notes

- p01-01: 7 files changed — footer alt+dimensions, card aria-labels, gbf-icon aria-hidden, header :alt→:aria-label, swiper bullet sizing, i18n keys
- p01-02: 4 files changed — card h5/h6→p.h5/p.h6, mega-menu button for dropdown triggers
- p02-01: 2 files changed — new app/utils/color-contrast.js (parseColor, relativeLuminance, contrastTextColor), updated app/composables/theme.js (badge styles use computed text color via contrastTextColor)
- p02-02: 6 files changed — new app/utils/flag-url.js (getFlagUrl utility), updated site.js, nt7.vue, body-tags-date.vue, country-tab-selector.vue, country-tab.vue to use getFlagUrl(); all already use <NuxtImg> so IPX proxying eliminates third-party cookies
- p03-01: 1 file changed — hero-image.vue refactored from CSS background-image to <NuxtPicture> with fetchpriority="high", preload, loading="eager"; gradient layers split into .hero-tint (mix-blend-mode: color) + .hero-overlay divs
- p03-02: 3 files changed — added @nuxtjs/critters module for critical CSS inlining, removed unused Bootstrap breadcrumb import; audit confirmed all other Bootstrap components are in use
- p03-03: 1 file changed — removed Roboto weight 900 from Google Fonts config; Leaflet already lazy via defineLazyHydrationComponent; emoji picker already lazy via LazyNuxtEmojiPicker
- p04-01: 4 files changed — new app/composables/ssr-stable-index.js (useSsrStableIndex wraps randomArrayIndexTimeBased with useState), updated page.js heroImage getter and gbif.vue getCountry() to use composable; onResponse hooks in e-learning/implementation/tsc/panorama confirmed safe (useFetch caches SSR results)
