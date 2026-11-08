import { NonRetriableError } from "inngest"
import { Resend } from "resend"

import { requireEnv } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

import { batchIdempotencyKey, composeEmail, sendConfig, splitBatch, type QueuedSend } from "./compose"
import { emailContentSchema } from "./blocks"

// Resend's limit for one batch call.
const BATCH_SIZE = 100

export const BROADCAST_SEND_EVENT = "broadcast/send.requested"

export type Recipient = { sendId: string; subscriberId: string; email: string; firstName: string | null }

export function resendClient() {
  return new Resend(requireEnv("RESEND_API_KEY"))
}

// Retried steps land here too, so "sending" counts as already started. Matching on
// scheduled_at stops an old run from firing after a cancel and a reschedule.
export async function startSend(broadcastId: string, scheduledAt: string, resume: boolean) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("broadcasts")
    .update({ state: "sending", last_error: null, updated_at: new Date().toISOString() })
    .eq("id", broadcastId)
    .eq("scheduled_at", scheduledAt)
    .in("state", ["scheduled", "sending", "failed"])
    .select("id")
  if (error) throw new Error(error.message)
  if (data.length === 0) return false

  if (!resume) {
    const { error: queueError } = await admin.rpc("queue_broadcast_sends", { target: broadcastId })
    if (queueError) throw new Error(queueError.message)
  }
  return true
}

// Its own step so that the recipient list is fixed before sending: a retried send
// must repeat the same payload for Resend's idempotency key to apply.
export async function prepareBatch(broadcastId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("sends")
    .select("id, subscriber_id, subscribers!inner (email, first_name, unsubscribed_at, suppressed)")
    .eq("broadcast_id", broadcastId)
    .is("sent_at", null)
    .order("id")
    .limit(BATCH_SIZE)
  if (error) throw new Error(error.message)

  const rows = data as unknown as QueuedSend[]
  const { recipients, optedOutSendIds } = splitBatch(rows)
  if (optedOutSendIds.length > 0) {
    const { error: deleteError } = await admin.from("sends").delete().in("id", optedOutSendIds)
    if (deleteError) throw new Error(deleteError.message)
  }
  return { recipients, hasMore: rows.length === BATCH_SIZE }
}

export async function sendBatch(broadcastId: string, recipients: Recipient[]) {
  const admin = createAdminClient()
  const { data: broadcast, error } = await admin
    .from("broadcasts")
    .select("subject, preheader, content")
    .eq("id", broadcastId)
    .single()
  if (error) throw new Error(error.message)

  const input = {
    subject: broadcast.subject as string | null,
    preheader: broadcast.preheader as string | null,
    content: emailContentSchema.parse(broadcast.content),
  }
  const config = sendConfig()
  const emails = await Promise.all(
    recipients.map((recipient) =>
      composeEmail(input, { id: recipient.subscriberId, email: recipient.email, firstName: recipient.firstName }, config)
    )
  )

  const { data: sent, error: sendError } = await resendClient().batch.send(emails, {
    idempotencyKey: batchIdempotencyKey(
      broadcastId,
      recipients.map((recipient) => recipient.sendId)
    ),
  })
  if (sendError) {
    const message = `Resend: ${sendError.message}`
    // Rate limits and outages pass. Anything else would fail the same way again.
    const retryable =
      sendError.statusCode === null ||
      sendError.statusCode >= 500 ||
      sendError.name === "rate_limit_exceeded" ||
      sendError.name === "concurrent_idempotent_requests"
    throw retryable ? new Error(message) : new NonRetriableError(message)
  }
  if (sent?.data.length !== recipients.length) {
    throw new Error(`Resend accepted ${sent?.data.length ?? 0} of ${recipients.length} emails`)
  }

  const sentAt = new Date().toISOString()
  await Promise.all(
    recipients.map(async (recipient, index) => {
      const { error: updateError } = await admin
        .from("sends")
        .update({ resend_message_id: sent.data[index].id, sent_at: sentAt })
        .eq("id", recipient.sendId)
      if (updateError) throw new Error(updateError.message)
    })
  )
  return recipients.length
}

export async function finishSend(broadcastId: string) {
  const now = new Date().toISOString()
  const { error } = await createAdminClient()
    .from("broadcasts")
    .update({ state: "sent", sent_at: now, updated_at: now })
    .eq("id", broadcastId)
    .eq("state", "sending")
  if (error) throw new Error(error.message)
}

export async function markSendFailed(broadcastId: string, message: string) {
  const { error } = await createAdminClient()
    .from("broadcasts")
    .update({ state: "failed", last_error: message, updated_at: new Date().toISOString() })
    .eq("id", broadcastId)
    .eq("state", "sending")
  if (error) throw new Error(error.message)
}
