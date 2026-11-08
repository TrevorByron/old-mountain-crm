import { runSync } from "@/lib/airtable/sync"
import {
  BROADCAST_SEND_EVENT,
  finishSend,
  markSendFailed,
  prepareBatch,
  sendBatch,
  startSend,
} from "@/lib/broadcasts/sending"

import { inngest } from "./client"

type SendRequest = { broadcastId: string; scheduledAt: string; resume?: boolean }

// Sends run one at a time, and sleeping until a scheduled time doesn't hold that slot.
export const sendBroadcast = inngest.createFunction(
  {
    id: "send-broadcast",
    triggers: [{ event: BROADCAST_SEND_EVENT }],
    concurrency: { limit: 1 },
    retries: 4,
    onFailure: async ({ event, error, step }) => {
      const { broadcastId } = event.data.event.data as SendRequest
      await step.run("mark-failed", () => markSendFailed(broadcastId, error.message))
    },
  },
  async ({ event, step }) => {
    const { broadcastId, scheduledAt, resume = false } = event.data as SendRequest

    await step.sleepUntil("wait-until-scheduled", scheduledAt)

    const started = await step.run("start", () => startSend(broadcastId, scheduledAt, resume))
    if (!started) return { skipped: true }

    let sent = 0
    for (let batch = 0; ; batch += 1) {
      const { recipients, hasMore } = await step.run(`prepare-batch-${batch}`, () => prepareBatch(broadcastId))
      if (recipients.length > 0) {
        sent += await step.run(`send-batch-${batch}`, () => sendBatch(broadcastId, recipients))
      }
      if (!hasMore) break
      await step.sleep(`throttle-${batch}`, "1s")
    }

    await step.run("finish", () => finishSend(broadcastId))
    return { sent }
  }
)

export const scheduledAirtableSync = inngest.createFunction(
  {
    id: "scheduled-airtable-sync",
    triggers: [{ cron: "*/15 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => step.run("sync-airtable", () => runSync("schedule"))
)
