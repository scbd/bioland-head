---
status: accepted
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/assets/schema.sql
origin: planning
plan: config-endpoint
---

# 0008. Registry backup posture

`server/assets/schema.sql` creates and uses a database named `i18n_cache`, and a database named
for a cache is what an operator truncates. We put the durable registry in a separate
`site_registry` database on the same server, reached by cross-database qualified names
(`site_registry.sites`) on the existing pool under the existing credentials. One grant, no new
variables — at that price it buys a structural boundary instead of a convention.

**Accepted — governs p02-01 and p04-04. p02-01 creates its tables in `site_registry`, not `i18n_cache`.**

See [details](details/0008.md).

**Related:** 0006, 0007, 0009.
