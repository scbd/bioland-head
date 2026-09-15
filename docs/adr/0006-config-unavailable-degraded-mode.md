---
status: proposed
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/utils/context-unified.ts
origin: planning
plan: config-endpoint
---

# 0006. Degraded-mode policy when site config is unavailable

A config that resolves to `null` throws 404 for every page of that site
(`server/utils/context-unified.ts:75-81` as cited by the plan; `:110-116` on this branch). Once
p04-01 deletes the dmsm fallback, a registry outage is a dark deployment rather than a degraded
one. We propose serving the last successful config from a stale-tolerant cache and degrading
features rather than failing closed: a stale theme beats a 404.

**Proposed — blocks p03-02 and p04-01.**

See [details](details/0006.md).

**Related:** 0007, 0008, 0009.
