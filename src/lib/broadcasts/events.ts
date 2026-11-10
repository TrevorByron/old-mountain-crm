import type { WebhookEventPayload } from "resend"

export type EmailEventType = "delivered" | "opened" | "clicked" | "bounced" | "complained"
export type SuppressReason = "hard_bounce" | "complaint"

export type TrackedEvent = {
  emailId: string
  type: EmailEventType
  linkUrl: string | null
  occurredAt: string
  isProbableBot: boolean
  suppress: SuppressReason | null
}

// Mail security scanners open and follow links almost the moment a message lands. A person doesn't.
const BOT_WINDOW_MS = 5_000
// A webhook can beat us to saving the message id, so an unknown one is retried for a while.
// Test sends have no send row, so they get dropped once this passes.
const UNKNOWN_SEND_RETRY_MS = 10 * 60_000

export function isProbableBot(sentAt: string | null, occurredAt: string) {
  if (!sentAt) return false
  return Date.parse(occurredAt) - Date.parse(sentAt) < BOT_WINDOW_MS
}

export function shouldRetryUnknownSend(occurredAt: string, now: number = Date.now()) {
  return now - Date.parse(occurredAt) < UNKNOWN_SEND_RETRY_MS
}

// Only a permanent bounce stops future email. A full inbox or a server hiccup can pass.
const isPermanentBounce = (type: string | undefined) => type?.toLowerCase() === "permanent"

// Turns Resend's event into what we store. Anything we don't track comes back null.
export function toTrackedEvent(payload: WebhookEventPayload, sentAt: string | null): TrackedEvent | null {
  const base = { linkUrl: null, isProbableBot: false, suppress: null, occurredAt: payload.created_at }
  switch (payload.type) {
    case "email.delivered":
      return { ...base, emailId: payload.data.email_id, type: "delivered" }
    case "email.opened":
      return { ...base, emailId: payload.data.email_id, type: "opened", isProbableBot: isProbableBot(sentAt, payload.created_at) }
    case "email.clicked":
      return {
        ...base,
        emailId: payload.data.email_id,
        type: "clicked",
        linkUrl: payload.data.click.link,
        occurredAt: payload.data.click.timestamp,
        isProbableBot: isProbableBot(sentAt, payload.data.click.timestamp),
      }
    case "email.bounced":
      return { ...base, emailId: payload.data.email_id, type: "bounced", suppress: isPermanentBounce(payload.data.bounce?.type) ? "hard_bounce" : null }
    case "email.complained":
      return { ...base, emailId: payload.data.email_id, type: "complained", suppress: "complaint" }
    // Resend refused it because this address already bounced or complained with them.
    case "email.suppressed":
      return { ...base, emailId: payload.data.email_id, type: "bounced", suppress: "hard_bounce" }
    default:
      return null
  }
}

export const trackedEmailId = (payload: WebhookEventPayload) => {
  const data = payload.data as { email_id?: unknown }
  return payload.type.startsWith("email.") && typeof data.email_id === "string" ? data.email_id : null
}
