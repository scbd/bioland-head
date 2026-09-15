---
status: proposed
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/utils/site-registry/  # prospective, not yet created
origin: planning
plan: config-endpoint
---

# 0007. Per-environment config database topology

`I18N_DB_HOST`, `_PORT`, `_USER`, `_PASSWORD` and `_NAME` are read per deployment
(`nuxt.config.ts:57-66`), but whether dev, stg and prod resolve to distinct database servers is an
operator fact this repo cannot answer. We propose not waiting for it: apply a hard `WHERE env = ?`
filter on every registry read unconditionally, since that is correct under either topology and costs
one predicate. The operator's answer then relaxes testing rather than gating work.

**Proposed — p02-01 and p02-02 proceed. `I18N_DB_CONNECTION_LIMIT` (default 5) must be raised
before the first flip.**

See [details](details/0007.md).

**Related:** 0006, 0008, 0009.
