import { createHash } from "node:crypto"

import { render } from "@react-email/render"
import { createElement } from "react"

import { BroadcastEmail, type EmailFooter } from "@/emails/broadcast-email"
import { createUnsubscribeToken, listUnsubscribeHeaders } from "@/lib/unsubscribe-token"

import type { BroadcastContent, LayoutKey } from "./content"

export type SendConfig = {
  from: string
  brandName: string
  postalAddress: string
  appUrl: string
  unsubscribeSecret: string
}

type Env = Record<string, string | undefined>

// Why sending can't happen right now, in words for the team. Tests only need email
// to work; real recipients also need unsubscribe links that work away from this machine.
export function sendBlockers(env: Env, { realRecipients }: { realRecipients: boolean }) {
  const blockers: string[] = []
  if (!env.RESEND_API_KEY) blockers.push("Add RESEND_API_KEY so email can be sent.")
  if (!env.SENDER_FROM) blockers.push("Set SENDER_FROM, the name and address emails come from.")
  if (!env.SENDER_POSTAL_ADDRESS?.trim()) {
    blockers.push("Set SENDER_POSTAL_ADDRESS. The law requires a postal address in every email.")
  }
  if (!env.UNSUBSCRIBE_TOKEN_SECRET) blockers.push("Set UNSUBSCRIBE_TOKEN_SECRET so unsubscribe links can be signed.")
  if (!env.APP_URL) blockers.push("Set APP_URL so unsubscribe links know where to go.")
  else if (realRecipients && /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(env.APP_URL)) {
    blockers.push("Deploy the app first. On localhost, subscribers' unsubscribe links wouldn't work.")
  }
  return blockers
}

export function sendConfig(env: Env = process.env): SendConfig {
  const blockers = sendBlockers(env, { realRecipients: false })
  if (blockers.length > 0) throw new Error(blockers.join(" "))
  return {
    from: env.SENDER_FROM as string,
    brandName: env.BRAND_NAME || "Old Mountain Tours & Explorations",
    postalAddress: env.SENDER_POSTAL_ADDRESS as string,
    appUrl: env.APP_URL as string,
    unsubscribeSecret: env.UNSUBSCRIBE_TOKEN_SECRET as string,
  }
}

async function renderBoth(layout: LayoutKey, email: BroadcastContent, footer: EmailFooter) {
  const element = createElement(BroadcastEmail, { layout, email, footer })
  return { html: await render(element), text: await render(element, { plainText: true }) }
}

// For the editor. The footer shows what's missing rather than hiding it.
export async function previewHtml(layout: LayoutKey, email: BroadcastContent, env: Env = process.env) {
  const { html } = await renderBoth(layout, email, {
    brandName: env.BRAND_NAME || "Old Mountain Tours & Explorations",
    postalAddress: env.SENDER_POSTAL_ADDRESS?.trim() || "[Postal address not set yet]",
    unsubscribeUrl: `${env.APP_URL ?? ""}/unsubscribe`,
  })
  return html
}

// The same call for every recipient, so a retried batch sends an identical payload.
export async function composeEmail(
  layout: LayoutKey,
  email: BroadcastContent,
  recipient: { id: string; email: string },
  config: SendConfig,
  { subjectPrefix = "" }: { subjectPrefix?: string } = {}
) {
  const token = createUnsubscribeToken(recipient.id, config.unsubscribeSecret)
  const { html, text } = await renderBoth(layout, email, {
    brandName: config.brandName,
    postalAddress: config.postalAddress,
    unsubscribeUrl: `${config.appUrl}/unsubscribe?token=${token}`,
  })
  return {
    from: config.from,
    to: [recipient.email],
    subject: `${subjectPrefix}${email.subject ?? ""}`,
    html,
    text,
    headers: listUnsubscribeHeaders(recipient.id, config.unsubscribeSecret, config.appUrl),
  }
}

export function batchIdempotencyKey(broadcastId: string, sendIds: string[]) {
  const digest = createHash("sha256").update([...sendIds].sort().join(",")).digest("hex")
  return `broadcast:${broadcastId}:batch:${digest}`
}

export type QueuedSend = {
  id: string
  subscriber_id: string
  subscribers: { email: string; unsubscribed_at: string | null; suppressed: boolean }
}

// Someone can unsubscribe after the audience was resolved. Check again just before sending.
export function splitBatch(rows: QueuedSend[]) {
  const optedOut = (row: QueuedSend) => Boolean(row.subscribers.unsubscribed_at) || row.subscribers.suppressed
  return {
    recipients: rows
      .filter((row) => !optedOut(row))
      .map((row) => ({ sendId: row.id, subscriberId: row.subscriber_id, email: row.subscribers.email })),
    optedOutSendIds: rows.filter(optedOut).map((row) => row.id),
  }
}
