---
status: proposed
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/assets/schema.sql
origin: planning
plan: config-endpoint
---

# 0008. Registry backup posture

`server/assets/schema.sql` creates and uses a database named `i18n_cache`, and a database named
for a cache is what an operator truncates to reset translations. Putting the durable site registry
there turns a routine cache reset into a config outage for every site in the deployment. We propose
keeping the tables in `i18n_cache`, documented as non-truncatable and covered by backup, with
p02-02's seeder as the rebuild path.

**Proposed — blocks p02-01 and p04-04.**

See [details](details/0008.md).

**Related:** 0006, 0007.
