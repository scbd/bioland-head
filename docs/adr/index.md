# ADR Index

| # | Decision (≤3 sentences) | Details | Status |
|---|-------------------------|---------|--------|
| [0001](0001-record-architecture-decisions.md) | We record architecturally significant decisions as ADRs in `docs/adr/`, numbered and immutable. | — | accepted |
| [0002](0002-dmsm-redirect-host-reverse-index.md) | A custom DMSM redirect Host cannot be parsed for siteCode by first-label splitting. bioland-head builds a cached redirectHost-to-siteCode map from DMSM's all-sites config for any non-`*.{baseHost}` host and fails closed on an unmapped one. | [details](details/0002.md) | accepted |
