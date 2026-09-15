---
status: proposed
date: 2026-09-10
deciders: ["Claude Fable 5.1 (planning agent)"]
requested-by: randy
context: system-wide
code-path: server/utils/
origin: agent-decision
plan: site-redirect-host
review-status: pending-user-review
---

# 0002. Keep x-forwarded-host trust in-app; gate the redirect-Host flip on an edge trust boundary

bioland-head resolves its Site from `x-forwarded-host` (`context-unified.ts:44`); the redirect-Host
plan's reverse index lets a spoofed header pick the wrong Site, an objection two devil's-advocate
critics raised. This agent kept that trust model unchanged, made every redirect target the Site's
canonical DMSM Host, not a header value, and turned edge Host hardening into a hard gate before the
flip ships. Devil's-advocate review 2026-09-10, 2 critics, 3 rounds: objection accepted for scope,
resolved as that rollout gate, not a code change.

See [details](details/0002.md).
