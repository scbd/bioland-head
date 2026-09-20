import { beginTiming, formatServerTiming, formatTimingLog, getTiming, isTimedPath, loggedPath, totalMs } from '../utils/request-timing'

/**
 * Emit a timing breakdown for every request that can be slow (BL-1069).
 *
 * The ticket's first step is "instrument the SSR render path so a cold request emits a
 * timing breakdown - without this we are guessing". This is that instrument.
 *
 * Two outputs, deliberately different in who can see them:
 *
 *  - **A log line, always.** `[timing]` at `warn` once a request crosses
 *    `runtimeConfig.timingSlowMs`, at `debug` below it. Production runs at `info`, so a cold
 *    8s render shows up in CloudWatch without turning on anything, while a warm 20ms
 *    request stays quiet.
 *  - **A `Server-Timing` header, only when asked for.** Off unless `NUXT_TIMING_HEADER` is
 *    set. The header survives CloudFront to every visitor, and per-leg upstream latency is
 *    a map of where to push. Turn it on in dev or staging, read it in devtools, leave it off
 *    in production.
 *
 * Written at `beforeResponse` rather than in a middleware for the same reason as
 * `document-cache-ttl.ts`: that is the last point where the response is still open. The
 * final total is taken at `afterResponse`, once the body is actually out.
 */
export default defineNitroPlugin((nitroApp) => {
    const { timingSlowMs, timingHeader } = useRuntimeConfig()

    const slowMs = Number.isFinite(timingSlowMs) && (timingSlowMs as number) > 0 ? (timingSlowMs as number) : 1000

    nitroApp.hooks.hook('request', (event) => {
        if (!isTimedPath(event.path)) return

        beginTiming(event)
    })

    nitroApp.hooks.hook('beforeResponse', (event) => {
        if (!timingHeader) return

        const state = getTiming(event)
        const res = event.node?.res

        if (!state || !res || res.headersSent) return

        res.setHeader('Server-Timing', formatServerTiming(state))
    })

    nitroApp.hooks.hook('afterResponse', (event) => {
        const state = getTiming(event)

        if (!state) return

        const total = totalMs(state)
        // The tenant is what makes one of these lines actionable: a cold start is per Site,
        // and the shared cache means the slow one is not always the one being looked at.
        const site = (event.context?.site as { siteCode?: string; locale?: string } | undefined)
        const line = `[timing] ${event.method} ${loggedPath(event.path)} ${event.node?.res?.statusCode ?? '-'} ${formatTimingLog(state)}`
        const detail = { siteCode: site?.siteCode, locale: site?.locale, totalMs: total, phases: state.phases }

        if (total >= slowMs) consola.warn(line, detail)
        else consola.debug(line, detail)
    })
})
