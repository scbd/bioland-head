# Tech debt ledger

Intentionally deferred issues, their impact ceiling, and the trigger that would justify a fix.
Format and rules: the `docs-debt` skill.

> This file is also created on branch `docs/BL-882-p01-02-adr-head-theme-resolution` with its own
> rows. The two tables reconcile when both branches land; neither was merged into the other.

| ID | Date | Source | Location | Issue | Ceiling / Impact | Fix trigger | Priority | Complexity | Status |
|----|------|--------|----------|-------|-------------------|-------------|----------|------------|--------|
| `BL-885-1` | 2026-08-24 | BL-885 review cycle 2 | `app/utils/resolve-theme.js` (`resolveLeaf`), pinned by the `[characterisation]` test in `tests/unit/app/utils/resolve-theme.test.ts` | An authored `homePageWidgets.columns: []` is a present, usable array, so it wins the precedence chain and the CHM home page renders no widget columns; the network leg is not restored. Whether an empty array should mean "no widgets" (current behaviour, and the intended reading — the same logic that makes `maxRowsPerColumn: 0` mean "unlimited") or should fall through was deliberately not decided in BL-885. **Tension to reconcile:** ADR 0012 section W2a validates the outer `columns` length to *exactly 3*, which contradicts accepting `[]` at all. Unresolved on purpose — someone must reconcile the resolver's fall-through rule against the ADR's length validation and pick one. | A site that clears every column loses its home widgets with no way to inherit the network's back; or the W2a validator rejects a value the resolver accepts, so the two layers disagree | An editor reports missing home widgets after clearing columns, or W2a validation is implemented and hits the mismatch | P3 | S | open |
