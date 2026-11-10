import type { WebhookEventPayload } from "resend"

import { pushToAirtable } from "@/lib/airtable/sync"
import { createAdminClient } from "@/lib/supabase/admin"

import { shouldRetryUnknownSend, toTrackedEvent, trackedEmailId } from "./events"

const WEBHOOK_ACTOR = "resend_webhook"

// Resend retries anything that isn't a 2xx and repeats the same delivery id, so running this
// twice has to be harmless. Throwing or returning "retry" asks for another attempt.
export async function recordResendEvent(deliveryId: string, payload: WebhookEventPayload): Promise<"recorded" | "ignored" | "retry"> {
  const emailId = trackedEmailId(payload)
  if (!emailId || !toTrackedEvent(payload, null)) return "ignored"

  const admin = createAdminClient()
  const { data: send, error: lookupError } = await admin
    .from("sends")
    .select("id, subscriber_id, sent_at")
    .eq("resend_message_id", emailId)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  if (!send) return shouldRetryUnknownSend(payload.created_at) ? "retry" : "ignored"

  const event = toTrackedEvent(payload, send.sent_at)
  if (!event) return "ignored"

  const { error: insertError } = await admin.from("email_events").upsert(
    {
      send_id: send.id,
      provider_event_id: deliveryId,
      type: event.type,
      link_url: event.linkUrl,
      occurred_at: event.occurredAt,
      is_probable_bot: event.isProbableBot,
      raw: payload,
    },
    { onConflict: "provider_event_id", ignoreDuplicates: true }
  )
  if (insertError) throw new Error(insertError.message)

  if (event.suppress) {
    const { data: updated, error: suppressError } = await admin
      .from("subscribers")
      .update({ suppressed: true, suppressed_reason: event.suppress, airtable_push_pending: true, last_changed_by: WEBHOOK_ACTOR })
      .eq("id", send.subscriber_id)
      .eq("suppressed", false)
      .select("id")
    if (suppressError) throw new Error(suppressError.message)
    if (updated.length > 0) await pushToAirtable(send.subscriber_id)
  }
  return "recorded"
}
