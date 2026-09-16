/**
 * Deduplicated, bounded-concurrency background translation queue (D7).
 *
 * `resolveTerms`'s `fb`-tier branch (`p02-01`) already serves English immediately on a locale miss
 * and writes a 1-minute `fb` cache entry. This module adds the write side of the `tr` tier: a
 * fire-and-forget background translation so the *next* request for the same `(id, locale)` gets the
 * real label instead of re-degrading every minute forever.
 *
 * **Dedupe key:** `` `${id}:${locale}` `` in the module-level {@link inFlight} map. Five concurrent
 * `enqueueTranslation` calls for the same pair all receive the *same* promise — only the first starts
 * an AWS call, the rest ride along. The entry is removed in a `finally` the instant the underlying work
 * settles (success or failure), so the map can never leak or wedge a key permanently in a "busy" state.
 *
 * **Queue-depth cap:** one in-flight entry per distinct `(id, locale)` pair already *is* the queue
 * depth, so {@link MAX_TRANSLATION_QUEUE_DEPTH} is checked directly against `inFlight.size`. A call for
 * a brand-new key once the cap is reached is refused (logged, no-op resolved promise, never added to
 * `inFlight`) so a multi-locale crawl hammering many distinct cold pairs cannot grow unbounded
 * background work. A call for a key *already* in `inFlight` is a dedupe hit, never refused by the cap.
 *
 * **Why not `createTranslator().translateBatch`:** per `phase-04/context.md`'s resolved design
 * conclusion, `translateBatch`'s final `saveCachedTranslations` call is unwrapped — a DB-write failure
 * there rejects the *whole* batch promise, which carries no return value to recover the already-
 * successful AWS translation from. That is structurally incompatible with this task's requirement that
 * a DB failure must still leave the `tr` entry written. This module instead composes the lower-level
 * `translateWithAws` (AWS-only) and `saveCachedTranslations` (DB-only) primitives directly: it writes
 * the `tr` entry the instant AWS resolves, then attempts the DB save in its own try/catch. It reuses
 * `translateBatch`'s concurrency-5 figure (a worker-pool pump bounded to {@link CONCURRENCY} lanes,
 * the same number and reasoning as the existing AWS cost/rate-limit ceiling) without calling that
 * function or adding a queue/semaphore package.
 *
 * **Never blocks the request path.** `enqueueTranslation` is synchronous up to the point of returning
 * a promise; all AWS/DB work happens after that promise is handed back, and the promise it returns
 * always *resolves* (never rejects) so a caller that does not await it never produces an unhandled-
 * rejection warning.
 */
import { getCacheKey, saveCachedTranslations, translateWithAws } from '../translate/index.js';
import { buildLabelKey } from './resolve-terms';

const STORAGE_GROUP = 'thesaurus';
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

/** Max concurrent AWS calls in flight at once — mirrors `createTranslator`'s own default. */
const CONCURRENCY = 5;

/**
 * Max distinct `(id, locale)` pairs allowed in flight at once. One in-flight entry per pair already
 * is the queue depth (see module docs), so this caps `inFlight.size` directly. Exported so tests
 * reference it instead of hardcoding the number twice.
 */
export const MAX_TRANSLATION_QUEUE_DEPTH = 50;

interface QueuedJob {
  id: string;
  locale: string;
  englishText: string;
  settle: () => void;
}

/** Keyed `` `${id}:${locale}` ``. See module docs for the dedupe contract. */
const inFlight = new Map<string, Promise<void>>();

/** Work waiting for a free concurrency lane; drained by {@link pump}. */
const pendingJobs: QueuedJob[] = [];

/** Number of jobs currently running (bounded to {@link CONCURRENCY}). */
let activeCount = 0;

/**
 * `consola` is a Nitro auto-import, not a static import — it can be absent under a plain unit harness,
 * and a bare call would throw from inside the very recovery path meant to never throw.
 */
function warn(message: string, payload?: Record<string, unknown>): void {
  try {
    (globalThis as { consola?: { warn?: (...args: unknown[]) => void } }).consola?.warn?.(message, payload);
  } catch {
    /* logging must never be the thing that breaks the queue */
  }
}

/** `useStorage` itself can throw when no mount is available; degrade to a no-op cache write instead. */
function queueStorage(): ReturnType<typeof useStorage> | null {
  try {
    return useStorage(STORAGE_GROUP);
  } catch {
    return null;
  }
}

/** Drain {@link pendingJobs} while a concurrency lane is free. */
function pump(): void {
  while (activeCount < CONCURRENCY && pendingJobs.length > 0) {
    const job = pendingJobs.shift();
    if (!job) break;
    activeCount++;
    void runJob(job).finally(() => {
      activeCount--;
      pump();
    });
  }
}

/**
 * Run one translation job: AWS call, then a best-effort `tr` cache write, then a best-effort DB save.
 * Never throws — every failure mode is caught and logged (identifier + locale only, per the D5 log
 * format; never the translated text).
 */
async function runJob(job: QueuedJob): Promise<void> {
  const { id, locale, englishText, settle } = job;
  try {
    let translated: string;
    try {
      translated = await translateWithAws(englishText, locale);
    } catch {
      // AWS failure: log and return without writing any `tr` entry — no poisoned/empty cache write.
      // The existing 1-minute `fb` TTL (p02-01) expires on its own and the next request re-attempts.
      warn('translation-queue: AWS translation failed', { id, locale });
      return;
    }

    // Write the `tr` entry the instant AWS succeeds — this does not depend on the DB step below.
    const storage = queueStorage();
    if (storage) {
      try {
        await storage.setItem(buildLabelKey('tr', id, locale), {
          value: translated,
          source: 'translation',
          expiresAt: Date.now() + SIX_MONTHS_MS
        });
      } catch {
        /* cache writes are best-effort; a failed write only costs a re-resolve later */
      }
    }

    // Separate try/catch: a DB failure must never delete or skip the `tr` entry already written above.
    try {
      await saveCachedTranslations(
        [{ cacheKey: getCacheKey(englishText), sourceText: englishText, translation: translated }],
        locale
      );
    } catch {
      warn('translation-queue: DB save failed', { id, locale });
    }
  } finally {
    settle();
  }
}

/**
 * Enqueue a deduplicated background translation for `(id, locale)`. Fire-and-forget from the caller's
 * perspective — the returned promise never rejects, so it never needs an await or a `.catch()`.
 *
 * @param id          - Thesaurus identifier the translation is stored under.
 * @param locale      - Target locale code.
 * @param englishText - The English source text to translate (from the `fb`-tier branch that already
 *                      resolved it).
 * @returns A promise that always resolves once the underlying work (or the queue-depth refusal) settles.
 */
export function enqueueTranslation(id: string, locale: string, englishText: string): Promise<void> {
  const key = `${id}:${locale}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  if (inFlight.size >= MAX_TRANSLATION_QUEUE_DEPTH) {
    warn('translation-queue: queue depth cap reached, dropping enqueue', { id, locale });
    return Promise.resolve();
  }

  let settle: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  // Regardless of outcome, the key must stop being "in flight" the moment work settles.
  const tracked = done.finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, tracked);

  pendingJobs.push({ id, locale, englishText, settle });
  pump();

  return tracked;
}
