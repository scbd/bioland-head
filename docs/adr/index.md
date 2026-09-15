# ADR Index

| # | Decision (≤3 sentences) | Details | Status |
|---|-------------------------|---------|--------|
| [0001](0001-record-architecture-decisions.md) | We record architecturally significant decisions as ADRs in `docs/adr/`, numbered and immutable. | — | accepted |
| [0002](0002-dmsm-redirect-host-reverse-index.md) | A custom DMSM redirect Host cannot be parsed for siteCode by first-label splitting. bioland-head builds a cached redirectHost-to-siteCode map from DMSM's all-sites config for any non-`*.{baseHost}` host and fails closed on an unmapped one. | [details](details/0002.md) | accepted |
| [0006](0006-config-unavailable-degraded-mode.md) | A null config throws 404 for every page of a site, so a registry outage after the dmsm fallback is deleted is a dark deployment. Proposed: serve the last successful config from a stale-tolerant cache and degrade features rather than fail closed. Blocks p03-02 and p04-01. | [details](details/0006.md) | proposed |
| [0007](0007-per-env-config-db-topology.md) | Whether dev, stg and prod point `I18N_DB_*` at distinct database servers is an operator fact this repo cannot answer. Proposed: apply a hard `WHERE env = ?` read filter unconditionally, which is correct under either topology, so p02-01 and p02-02 proceed today. `I18N_DB_CONNECTION_LIMIT` (default 5) must be raised before the first flip. | [details](details/0007.md) | proposed |
| [0008](0008-registry-backup-posture.md) | The registry tables would live in a database named `i18n_cache`, which is what an operator truncates to reset translations. Proposed: a separate `site_registry` database on the same pool via qualified table names — one grant, no new variables, a structural boundary. Blocks p02-01 and p04-04. | [details](details/0008.md) | proposed |
| [0009](0009-cutover-soak-window-and-fallback-threshold.md) | p02-09's `config.source.fallback` counter has no total-read denominator, so a percentage fallback rate is not queryable. Proposed: an absolute budget per soak window — 24h dev, 48h stg, 72h prod, zero `site-absent-from-registry` and at most five `registry-unreachable` fleet-wide with no two inside one 5-minute window. Blocks OPS-1. | [details](details/0009.md) | proposed |

The 80-word ADR body cap counts the prose of the summary only — not the `#` heading, the status line, the `See [details]` pointer, or the `**Related:**` line.
