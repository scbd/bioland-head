import type { H3Event } from 'h3'

/**
 * Per-request timing collection for the SSR path (BL-1069).
 *
 * The root document takes ~8.4s on a cache miss and ~0ms on a CloudFront hit, so every
 * performance question on this epic reduces to "which leg of a cold render is slow?".
 * Nothing in the app answered that: upstream latency, shared-EFS cache reads and the Vue
 * render were all folded into one opaque number.
 *
 * This module is the collector. `server/plugins/02.request-timing.ts` starts and closes a
 * request's timeline; call sites add named phases with `timePhase`.
 *
 * Scope, stated plainly so the numbers are not over-read:
 *  - During SSR the app fetches `/api/page/...` and `/api/menus` through Nitro's local
 *    fetch, which are *separate* Nitro requests. They get their own timed lines rather than
 *    nesting inside the document's, because correlating parent to child needs an async
 *    context this build does not enable. A document's render cost is therefore its own
 *    total minus the child request totals logged inside its window.
 *  - Cache-store latency is not measured directly. It shows up as the gap between a phase
 *    and the upstream fetches `server/utils/fetch-options.js` logs inside it.
 */

export interface TimingPhase {
    /** Phase label, e.g. `ctx`, `dmsm`, `drupal-settings`. */
    name: string
    /** Wall-clock duration in milliseconds, rounded to one decimal. */
    ms: number
}

export interface TimingState {
    /** `performance.now()` reading taken when the request entered Nitro. */
    startedAt: number
    phases: TimingPhase[]
}

/**
 * A runaway loop adding phases would otherwise grow an unbounded array and an unbounded
 * response header for the life of the request. Past this, phases are counted, not kept.
 */
export const MAX_PHASES = 40

const STATE_KEY = '__blRequestTiming'

type TimedEventContext = Record<string, unknown> & { [STATE_KEY]?: TimingState }

const contextOf = (event: H3Event | undefined | null): TimedEventContext | undefined =>
    (event?.context as TimedEventContext | undefined)

const round = (ms: number): number => Math.round(ms * 10) / 10

/** Start a request's timeline. Safe to call twice; the first start wins. */
export function beginTiming(event: H3Event, startedAt: number = performance.now()): TimingState | undefined {
    const context = contextOf(event)

    if (!context) return undefined
    if (context[STATE_KEY]) return context[STATE_KEY]

    context[STATE_KEY] = { startedAt, phases: [] }

    return context[STATE_KEY]
}

export const getTiming = (event: H3Event | undefined | null): TimingState | undefined => contextOf(event)?.[STATE_KEY]

/**
 * Record a completed phase against a request.
 *
 * A no-op when the request was never started (static assets, or a call made outside a
 * request), so instrumented call sites never have to ask whether timing is on.
 */
export function recordPhase(event: H3Event | undefined | null, name: string, ms: number): void {
    const state = getTiming(event)

    if (!state || !Number.isFinite(ms)) return
    if (state.phases.length >= MAX_PHASES) return

    state.phases.push({ name, ms: round(ms) })
}

/**
 * Time an async leg of the request and record it.
 *
 * The duration is recorded for a rejection too - a slow failure is exactly the shape of a
 * cold start behind an upstream timeout, and losing it would hide the interesting case.
 */
export async function timePhase<T>(event: H3Event | undefined | null, name: string, fn: () => Promise<T>): Promise<T> {
    const startedAt = performance.now()

    try {
        return await fn()
    } finally {
        recordPhase(event, name, performance.now() - startedAt)
    }
}

export const totalMs = (state: TimingState, now: number = performance.now()): number => round(now - state.startedAt)

/** `Server-Timing` allows a token for a name: letters, digits, `_` and `-`. */
const toToken = (name: string): string => name.replace(/[^\w-]/g, '_').slice(0, 40) || 'phase'

/**
 * Render the timeline as a `Server-Timing` header value.
 *
 * Emitted only when `runtimeConfig.timingHeader` is on: a response carries it through
 * CloudFront to anyone, and upstream latency per leg is more than a visitor needs to know.
 */
export function formatServerTiming(state: TimingState, now: number = performance.now()): string {
    const phases = state.phases.map(({ name, ms }) => `${toToken(name)};dur=${ms}`)

    return [...phases, `total;dur=${totalMs(state, now)}`].join(', ')
}

/** Render the timeline for a log line: `total=8431.2ms ctx=12.4ms dmsm=430.1ms`. */
export function formatTimingLog(state: TimingState, now: number = performance.now()): string {
    const phases = state.phases.map(({ name, ms }) => `${name}=${ms}ms`)

    return [`total=${totalMs(state, now)}ms`, ...phases].join(' ')
}

/**
 * Paths whose timing is noise: static assets and Nuxt's own endpoints never touch Drupal,
 * the DMSM config or the cache, and there are hundreds of them per page.
 */
const UNTIMED_PREFIXES = ['/_nuxt', '/_ipx', '/_i18n', '/__nuxt', '/fonts', '/favicon.ico', '/.well-known']

export const isTimedPath = (path: string | undefined): boolean =>
    !!path && !UNTIMED_PREFIXES.some((prefix) => path.startsWith(prefix))

/**
 * The path as logged: everything before the query string.
 *
 * Internal SSR fetches carry the whole site context as query parameters, which makes a log line
 * several hundred characters of noise, and a query string is the wrong place for anything worth
 * keeping out of a log.
 */
export const loggedPath = (path: string | undefined): string => (path || '/').split('?')[0] as string
