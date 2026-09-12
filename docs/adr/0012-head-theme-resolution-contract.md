---
status: accepted
date: 2026-08-24
deciders: [randy]
context: system-wide
code-path: app/utils/resolve-theme.js
origin: implementation
plan: themeing-front-end
phase: p01
---

# 0012. Head theme resolution contract

Theme keys reach the head from three places, so every read needs one precedence and one merge
rule. We resolve `biolandSettings.theme` first, then site `config.theme`, then `runTime.theme`,
then code defaults, merging per leaf rather than per object. Absence never throws: an unseeded
site renders exactly as it does today, and `hero.primary` is derived from
`[color.primary, color.secondary]` only when no source authored it.

See [details](details/0012.md).
