/**
 * Scheduled Nitro task: publish this deployment's CHM Network summary.
 *
 * Registered hourly in `nuxt.config.ts` under `nitro.scheduledTasks`
 * (`nitro.experimental.tasks` is already `true`). **Hourly** because the CHM
 * Network view is low-traffic and slow-changing — sites are added and published
 * by hand, not by the minute — so an hour bounds worst-case staleness at 60
 * minutes for 24 writes per deployment per day. A tighter interval would buy
 * nothing a reader could notice while multiplying the exposure of the one
 * cross-deployment write path in the plan.
 *
 * **Configuring this per deployment is a manual operator step.** The registration
 * runs wherever the app runs, but what each deployment does depends on two
 * differently-named variables — a sender's and a receiver's, never one name for
 * both:
 *
 * - **Sending deployment (dev, stg).** Set `NUXT_NETWORK_SUMMARY_TARGET_URL` to
 *   the receiver's `/api/site-registry/network`, and
 *   `NUXT_NETWORK_SUMMARY_PUSH_TOKEN` to its own **bare** token — the token half
 *   of its entry in the receiver's list, `<token-a>`, never `dev:<token-a>`.
 *   Without both, the task reports `skipped` and does nothing.
 * - **Receiving deployment (prod).** Set `NUXT_NETWORK_SUMMARY_INGEST_TOKENS` to
 *   the comma-separated `scope:token` list it accepts, including an entry for
 *   prod itself so prod can read its own store:
 *   `dev:<token-a>,stg/bsl:<token-b>,prod:<token-c>`. Prod sets no target URL and
 *   no push token, so its own copy of this task stays `skipped` — as intended.
 *
 * A deployment that has no sites yet also reports `skipped`: publishing an empty
 * summary would erase its column at the receiver, so it is refused on both ends.
 *
 * The task never throws: `pushNetworkSummary` returns a result instead, so a
 * failed push logs loudly and leaves the receiving deployment's previous rows in
 * place rather than crash-looping the scheduler.
 */
import { pushNetworkSummary } from '../utils/site-registry/network-summary'

export default defineTask({
  meta: {
    name: 'network-summary-push',
    description: "Publish this deployment's CHM Network site summary to the prod-owned table",
  },

  async run() {
    const result = await pushNetworkSummary()

    if (result.status === 'failed') {
      console.error('[network-summary-push] push failed; previous rows left in place:', result.reason)
    }

    return { result }
  },
})
