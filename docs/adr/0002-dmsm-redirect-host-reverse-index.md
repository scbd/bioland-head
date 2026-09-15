---
status: accepted
date: 2026-09-10
deciders: [randy]
context: system-wide
code-path: server/utils/, shared/utils/
origin: planning
plan: site-redirect-host
---

# 0002. Resolve a custom redirect Host to its siteCode with a cached DMSM reverse index

bioland-head reads siteCode from the Host header's first label everywhere, but a DMSM-configured
custom redirect host cannot be parsed that way. Since DMSM exposes only per-site and all-sites
config, not a by-host lookup, we build a redirectHost-to-siteCode map from the all-sites config
for any host outside `*.{baseHost}`, cache it 300 seconds behind one function, and fail closed
(400) on an unmapped host. The single function keeps a future DMSM by-host endpoint a drop-in
replacement.

See [details](details/0002.md).
