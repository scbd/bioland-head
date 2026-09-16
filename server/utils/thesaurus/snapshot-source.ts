/**
 * Rollback source for label resolution (D12): reads a committed snapshot archive instead of calling the
 * live thesaurus API. Selected by the `NUXT_THESAURUS_LABEL_SOURCE=snapshot` env flag — see the flag
 * branch in `resolve-terms.ts` — so a production API degradation is recovered by flipping an env var on
 * the running container, no code revert, no redeploy.
 *
 * ⚠ **The real archive is a `p03-05` deliverable and does not exist yet.** This task only wires the seam;
 * its own tests exercise a fixture archive
 * (`tests/unit/server/utils/thesaurus/fixtures/label-snapshot.fixture.json`) standing in for the real one.
 */
import type { ResolvedLabel } from './resolve-terms';

/**
 * `server/assets/thesaurus-label-snapshot.json`'s key under the `assets:server` mount (bundled the same
 * way as the alias maps — see `ALIAS_ASSET_PREFIX` in `resolve-terms.ts` for why `server/assets/**` and
 * not `server/utils/**` is used for anything read at request time in the built server).
 */
const SNAPSHOT_ASSET_KEY = 'thesaurus-label-snapshot.json';

/** Archive shape: identifier -> locale -> plain label string. */
type SnapshotArchive = Record<string, Record<string, string>>;

/**
 * `consola` is a Nitro auto-import, not a static import, so it can be absent (unit harness); a bare call
 * would throw from inside this module's own never-throw recovery path.
 */
function warn(message: string, payload?: Record<string, unknown>): void {
  try {
    (globalThis as { consola?: { warn?: (...args: unknown[]) => void } }).consola?.warn?.(message, payload);
  } catch {
    /* logging must never be the thing that breaks resolution */
  }
}

let archive: SnapshotArchive | null = null;
let archiveLoad: Promise<void> | null = null;
let archiveWarned = false;

/** Load the archive once. Idempotent; a failure leaves {@link archive} `null` and retries next call. */
async function loadArchive(): Promise<SnapshotArchive | null> {
  if (archive) return archive;
  archiveLoad ??= (async () => {
    try {
      const storage = useStorage('assets:server');
      const raw = await storage.getItem(SNAPSHOT_ASSET_KEY);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') archive = parsed as SnapshotArchive;
    } catch {
      /* handled by the warning below — missing file, unreadable mount, or invalid JSON all land here */
    }
  })();
  try {
    await archiveLoad;
  } finally {
    if (!archive) archiveLoad = null;
  }
  if (!archive && !archiveWarned) {
    archiveWarned = true;
    warn('resolveFromSnapshot: archive missing or unreadable', { path: SNAPSHOT_ASSET_KEY });
  }
  return archive;
}

/**
 * Resolve a batch of thesaurus identifiers from the committed snapshot archive rather than the live API.
 *
 * **Never throws** — for any input, including an empty `ids` array or a malformed (invalid-JSON) archive
 * file. A missing archive, a missing id, or a missing locale within an id all degrade per D5 to
 * `{ value: id, source: 'identifier' }` for that id, the same shape {@link resolveTerms} itself returns on
 * a full miss.
 *
 * @param ids    - Thesaurus identifiers to resolve. Non-string and empty entries are ignored.
 * @param locale - Requested locale code, e.g. `fr`.
 * @returns One entry per valid requested id, keyed by the id as requested.
 */
export async function resolveFromSnapshot(ids: string[], locale: string): Promise<Record<string, ResolvedLabel>> {
  // Null-prototype for the same reason as resolveTerms: ids are caller-supplied, and a plain object lets
  // `__proto__` silently vanish as an own key instead of being stored.
  const resolved: Record<string, ResolvedLabel> = Object.create(null);
  try {
    if (!Array.isArray(ids) || ids.length === 0) return resolved;
    const loc = typeof locale === 'string' && locale.trim() ? locale.trim() : 'en';
    const data = await loadArchive();
    for (const id of ids) {
      if (typeof id !== 'string' || !id) continue;
      const value = data?.[id]?.[loc];
      resolved[id] = typeof value === 'string' && value.trim()
        ? { value: value.trim(), source: 'api' }
        : { value: id, source: 'identifier' };
    }
  } catch {
    /* never throw — whatever resolved before the fault is served */
  }
  return resolved;
}
