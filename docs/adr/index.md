# ADR Index

| # | Decision (≤3 sentences) | Details | Status |
|---|-------------------------|---------|--------|
| [0001](0001-record-architecture-decisions.md) | We record architecturally significant decisions as ADRs in `docs/adr/`, numbered and immutable. | — | accepted |
| [0002](0002-dmsm-redirect-host-reverse-index.md) | A custom DMSM redirect Host cannot be parsed for siteCode by first-label splitting. bioland-head builds a cached redirectHost-to-siteCode map from DMSM's all-sites config for any non-`*.{baseHost}` host and fails closed on an unmapped one. | [details](details/0002.md) | accepted |
| [0010](0010-shared-cache-mount-config-invalidation.md) | `./cache` is a shared mount, so removing a site's entries from `useStorage("cache")` invalidates its config on every container at once. `invalidateSiteConfig()` is a thin wrapper over that removal. The planned generation counter was dropped because a read-side coherence check would add a database round trip to the hottest path for a staleness bound that is already zero. | [details](details/0010.md) | proposed |
