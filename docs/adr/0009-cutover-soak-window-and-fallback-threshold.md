---
status: accepted
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/utils/observability/  # prospective, not yet created
origin: planning
plan: config-endpoint
---

# 0009. Cutover soak window and fallback threshold

OPS-1's verdict must be a query, and p02-09 counts `config.source.fallback` events keyed
`env:multiSiteCode:siteCode:reason`, per-container, with no total-read denominator, so a
percentage rate is unanswerable. We use an absolute error budget per soak window — 24 hours on
dev, 48 on stg, 72 on prod — passing a slice only when `site-absent-from-registry` is zero and
`registry-unreachable` stays at or under five fleet-wide with no two events inside one 5-minute
window.

**Accepted — governs OPS-1.**

See [details](details/0009.md).

**Related:** 0006, 0007, 0008.
