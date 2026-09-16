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
 * **Never blocks the request path.** The caller (`resolveTerms`) never awaits `enqueueTranslation`, so
 * nothing here can stall a response — but the call itself is not *entirely* free of the request's own
 * call stack: `pump` -> `runJob` runs synchronously up to its own first `await` (the {@link
 * checkSupportedLocales} / negative-cache reads below), so those checks execute before
 * `enqueueTranslation` hands its promise back. That work is a cache/map lookup, not network I/O, so it
 * is cheap; only the AWS `TranslateText`/`TranslateDocument` call and the DB save happen strictly after.
 *
 * **Locale-support gate (BL-1004).** Every job re-validates its locale against AWS Translate's
 * supported-language set via {@link checkSupportedLocales} before spending a call — `resolveTerms`
 * already gates on the requesting site's *configured* locales (a stricter, site-scoped allowlist; see
 * its `isLocaleAllowedForSite`), but this module has no `event` to consult that list, so it re-applies
 * the one check it *can* make independently: never call AWS for a locale AWS itself does not support.
 * This is defense in depth, not a substitute for the site gate — a future caller that reaches
 * `enqueueTranslation` directly, bypassing `resolveTerms`, still cannot turn an obviously-invalid locale
 * into a permanent retry generator.
 *
 * **Negative cache for transient failures (BL-1004).** A locale that AWS *does* support can still fail
 * transiently (throttling, a network blip). Before p04-01's fix, every later request for the same
 * `(id, locale)` pair re-entered this module and re-attempted the AWS call the moment `resolveTerms`'s
 * 1-minute `fb` cache entry expired, forever, with no backoff. A short-TTL failure marker
 * ({@link FAILURE_BACKOFF_MS}) now makes the next few attempts within that window a no-op instead —
 * long enough to meaningfully cut retry volume for a page a crawler keeps re-fetching, short enough that
 * a genuine recovery (AWS back up, or the transient error was one-off) is not hidden for long.
 */
import { consola } from 'consola';
import { checkSupportedLocales, getCacheKey, getCachedTranslations, saveCachedTranslations, translateWithAws } from '../translate/index.js';
import { LABEL_CACHE_VERSION, writeTier } from './resolve-terms';

const STORAGE_GROUP = 'thesaurus';
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;
/**
 * How long a transient AWS/DB failure suppresses re-attempts for the same `(id, locale)` pair.
 * Meaningfully longer than `resolveTerms`'s 1-minute `fb` TTL (so it actually reduces retry volume
 * beyond that existing implicit backoff) while short enough that a real recovery surfaces quickly.
 */
export const FAILURE_BACKOFF_MS = 1000 * 60 * 5;

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
 * `consola` is imported statically, not read off `globalThis`. Nitro's auto-import is a build-time
 * transform of a free identifier and never assigns a `globalThis` property, so the previous
 * `globalThis.consola?.warn?.()` form was permanently undefined in the real server and silently
 * swallowed every queue warning. The defensive `try` stays: this is called from recovery paths that
 * must never throw. (Same finding the reviewer raised against `resolve-terms.ts` in #105.)
 */
function warn(message: string, payload?: Record<string, unknown>): void {
  try {
    consola.warn(message, payload);
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

/**
 * Key for the transient-failure negative cache. Percent-encoded for the same reason as
 * `resolve-terms.ts`'s `buildLabelKey`: `id`/`locale` can themselves contain `:`, and `unstorage` folds
 * `/`/`\` into `:` at the driver boundary, so an unescaped join could collide two distinct pairs onto
 * one key.
 */
function buildFailureKey(id: string, locale: string): string {
  return `label:tr-fail:${LABEL_CACHE_VERSION}:${encodeURIComponent(id)}:${encodeURIComponent(locale)}`;
}

/** Read the negative cache. Returns `false` on a miss, an expired entry, or any storage error. */
async function hasRecentFailure(
  storage: ReturnType<typeof useStorage> | null,
  id: string,
  locale: string,
  now: number
): Promise<boolean> {
  if (!storage) return false;
  try {
    const raw = await storage.getItem(buildFailureKey(id, locale));
    const stored = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { expiresAt?: number } | null;
    return typeof stored?.expiresAt === 'number' && now <= stored.expiresAt;
  } catch {
    return false;
  }
}

/** Write the negative cache. A storage failure must never surface to the caller. */
async function markFailure(
  storage: ReturnType<typeof useStorage> | null,
  id: string,
  locale: string,
  now: number
): Promise<void> {
  if (!storage) return;
  try {
    await storage.setItem(buildFailureKey(id, locale), { expiresAt: now + FAILURE_BACKOFF_MS });
  } catch {
    /* cache writes are best-effort; a failed write only costs an extra retry */
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
  const storage = queueStorage();
  try {
    const now = Date.now();

    // Negative cache: a locale that transiently failed recently is skipped without hitting AWS again.
    if (await hasRecentFailure(storage, id, locale, now)) {
      warn('translation-queue: skipping recently-failed pair', { id, locale });
      return;
    }

    // Locale-support gate (BL-1004) — see module docs for why this, not the site allowlist, is the
    // right check at this seam. A check failure (e.g. AWS unreachable) is treated the same as
    // "unsupported": skip rather than spend a call we cannot first verify is legitimate.
    try {
      const { supported } = await checkSupportedLocales([locale]);
      if (!supported.includes(locale)) {
        warn('translation-queue: locale not supported by AWS Translate, skipping', { id, locale });
        return;
      }
    } catch {
      // A check failure leaves the supported-language cache empty, so WITHOUT a backoff mark every
      // queued term re-requests ListLanguages, and every request cycle retries again the moment the
      // 1-minute `fb` TTL expires - the exact retry storm FAILURE_BACKOFF_MS exists to prevent.
      warn('translation-queue: locale support check failed, skipping', { id, locale });
      await markFailure(storage, id, locale, now);
      return;
    }

    // The DB cache is keyed by TEXT, not by identifier, so it can already hold this exact
    // English/locale pair - after the six-month `tr` entry expired, or because another identifier or
    // feature translated identical text. Calling AWS unconditionally defeated that cache and paid for
    // the same translation again. Read it first; on a hit, populate the `tr` tier and stop.
    let cached: string | undefined;
    try {
      const hits = await getCachedTranslations([englishText], locale);
      const hit = hits?.get?.(getCacheKey(englishText));
      if (typeof hit === 'string' && hit) cached = hit;
    } catch {
      // A cache-read failure is not a translation failure: fall through to AWS rather than
      // marking the pair failed and suppressing a translation we can still produce.
      warn('translation-queue: translation cache read failed', { id, locale });
    }

    if (cached !== undefined) {
      await writeTier(storage, 'tr', id, locale, { value: cached, source: 'translation' }, Date.now() + SIX_MONTHS_MS);
      return;
    }

    let translated: string;
    try {
      translated = await translateWithAws(englishText, locale);
    } catch {
      // AWS failure: log, mark the negative cache, and return without writing any `tr` entry — no
      // poisoned/empty cache write. The next attempt is suppressed for FAILURE_BACKOFF_MS instead of
      // re-firing on every request the moment the 1-minute `fb` TTL (p02-01) expires.
      warn('translation-queue: AWS translation failed', { id, locale });
      await markFailure(storage, id, locale, now);
      return;
    }

    // Write the `tr` entry the instant AWS succeeds — this does not depend on the DB step below.
    await writeTier(storage, 'tr', id, locale, { value: translated, source: 'translation' }, Date.now() + SIX_MONTHS_MS);

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
