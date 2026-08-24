# Tech debt ledger

Intentionally deferred issues, their impact ceiling, and the trigger that would justify a fix.
Format and rules: the `docs-debt` skill.

| ID | Date | Source | Location | Issue | Ceiling / Impact | Fix trigger | Priority | Complexity | Status |
|----|------|--------|----------|-------|-------------------|-------------|----------|------------|--------|
| `41c5ac1` | 2026-08-24 | ADR 0012 (W2) | `app/components/page/home-chm.vue:18` | CHM home grid hardcodes col-md-4, so the column count is fixed at 3 | Editors cannot pick a column count; `theme.home_page_widgets.columns` validates to exactly 3 | Editors need a home grid with other than 3 columns | P3 | M | open |
