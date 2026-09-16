---
status: accepted
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/utils/context-unified.ts
origin: planning
plan: config-endpoint
---

# 0006. Degraded-mode policy when site config is unavailable

Today a `null` config throws 404 for every page of a site
(`server/utils/context-unified.ts:110-116` on this branch, cited by the plan as
`context-unified.ts:75-81`). Once p04-01 deletes the dmsm fallback, a registry outage becomes a
dark deployment. We serve the last-known-good config instead and degrade features: a stale theme
beats a total outage. A genuinely absent site still 404s. A cold container that never cached the
site also still 404s — an accepted residual risk.

**Accepted — governs p03-02 and p04-01.**

See [details](details/0006.md).

**Related:** 0007, 0008, 0009.
