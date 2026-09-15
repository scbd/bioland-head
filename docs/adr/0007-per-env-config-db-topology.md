---
status: proposed
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/utils/site-registry/
origin: planning
plan: config-endpoint
---

# 0007. Per-environment config database topology

`I18N_DB_HOST`, `_PORT`, `_USER`, `_PASSWORD` and `_NAME` are read per deployment
(`nuxt.config.ts:57-66`), but whether dev, stg and prod resolve to distinct database servers is an
operator fact this repo cannot answer. We propose confirming distinct servers per environment, so
the registry inherits the isolation the plan's decision 6 already assumes. A shared server is
workable but forces a hard per-environment read filter on every registry query.

**Proposed — blocks p02-01 and p02-02 until the operator confirms.**

See [details](details/0007.md).

**Related:** 0006, 0008.
