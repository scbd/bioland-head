# Roadmap

## Phase 01: Accessibility & SEO Quick Fixes

**Context:** [phase-01/context.md](phase-01/context.md)

| ID | Task | Status | Depends On |
|----|------|--------|------------|
| p01-01 | [Image & link accessibility overhaul](phase-01/p01-01-image-link-accessibility.md) | ✅ complete | none |
| p01-02 | [Heading structure & crawlable anchors](phase-01/p01-02-heading-crawlable-anchors.md) | ✅ complete | none |

## Phase 02: Best Practices & Visual Fixes

**Context:** [phase-02/context.md](phase-02/context.md)  
**Requires:** Phase 01 complete

| ID | Task | Status | Depends On |
|----|------|--------|------------|
| p02-01 | [Badge color contrast](phase-02/p02-01-badge-color-contrast.md) | ✅ complete | p01-01 |
| p02-02 | [Third-party cookie elimination](phase-02/p02-02-third-party-cookies.md) | ✅ complete | none |

## Phase 03: Performance Optimization

**Context:** [phase-03/context.md](phase-03/context.md)  
**Requires:** Phase 02 complete

| ID | Task | Status | Depends On |
|----|------|--------|------------|
| p03-01 | [Hero image LCP optimization](phase-03/p03-01-hero-lcp-optimization.md) | ✅ complete | none |
| p03-02 | [CSS optimization & critical CSS](phase-03/p03-02-css-optimization.md) | ✅ complete | none |
| p03-03 | [JavaScript bundle reduction](phase-03/p03-03-js-bundle-reduction.md) | ✅ complete | none |

## Phase 04: Hydration Investigation

**Context:** [phase-04/context.md](phase-04/context.md)  
**Requires:** Phase 01–03 complete (to avoid masking fixes)

| ID | Task | Status | Depends On |
|----|------|--------|------------|
| p04-01 | [Hydration mismatch investigation & fix](phase-04/p04-01-hydration-mismatch.md) | ✅ complete | p03-01 |

## Status Legend

- ⬜ pending
- 🔄 in-progress
- ✅ complete
- ❌ blocked
- ⏸️ paused
