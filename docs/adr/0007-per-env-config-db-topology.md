---
status: accepted
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
operator fact this repo cannot answer. We decide the mechanism, not the topology: apply a hard
`WHERE env = ?` filter on every registry read, unconditionally. It is correct under a shared or a
distinct-server deployment and costs one predicate, so the operator's answer is an optimisation,
never a gate.

**Accepted — governs p02-01 and p02-02, both unblocked now. `I18N_DB_CONNECTION_LIMIT` (default 5) must be raised before the first flip.**

See [details](details/0007.md).

**Related:** 0006, 0008, 0009.
