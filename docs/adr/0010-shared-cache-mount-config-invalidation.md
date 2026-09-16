---
status: proposed
date: 2026-09-15
deciders: [randy]
context: system-wide
code-path: server/utils/site-registry/
origin: implementation
plan: config-endpoint
phase: p02
---

# 0010. Invalidate config through the shared cache mount, not a generation counter

A config publish must not leave part of the container fleet serving the old config. `./cache`
is a shared mount, so dropping a site's entries from `useStorage("cache")` already reaches
every container, and `invalidateSiteConfig()` is a thin wrapper that does that. We dropped the
planned generation counter: a read-side coherence check would put a database round trip on the
hottest path in the app and buy nothing against a staleness bound that is already zero.

See [details](details/0010.md).
