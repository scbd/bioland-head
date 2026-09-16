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
 * **Scheduling this task per deployment is a manual operator step.** The
 * registration below runs wherever the app runs, but a deployment only publishes
 * once `NUXT_NETWORK_SUMMARY_TARGET_URL` and `NUXT_NETWORK_SUMMARY_PUSH_TOKEN`
 * are set in its environment; without them the task reports `skipped` and does
 * nothing. Prod, the receiving deployment, is expected to stay in that state.
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
