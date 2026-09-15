---
status: proposed
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/utils/observability/
origin: planning
plan: config-endpoint
---

# 0009. Cutover soak window and fallback threshold

OPS-1's verdict must be a query, and p02-09 counts `config.source.fallback` events grouped by
`reason` with no total-read denominator, so a percentage rate is not computable from it. We
propose an absolute count per soak window instead: 24 hours on dev, 48 on stg, 72 on prod, passing
a slice only when `site-absent-from-registry` is zero and `registry-unreachable` is at most one.

**Proposed — blocks OPS-1.**

See [details](details/0009.md).

**Related:** 0006.
