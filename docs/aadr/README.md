# Agent Architecture Decision Records (AADRs)

Decisions an AI agent took autonomously, on the user's behalf, at a point where it would otherwise
have stopped to ask. They exist so the user can review and ratify, or reverse, each one on return.

- **Format:** the project ADR format (see the `docs-adrs` skill's `ADR-FORMAT.md`) plus three
  agent-provenance fields. See [`0001`](0001-initialize-aadr-practice.md).
- **Status of every record here:** `proposed` until reviewed. `review-status: pending-user-review`
  is the flag.
- **Index:** see [`index.md`](index.md) for the summary of every AADR.

> **Review checklist:** for each record, either (a) accept as-is, (b) accept and promote to
> `../adr/`, or (c) reverse, then tell the agent to redo the affected work.
