import { createHash } from "node:crypto"

import { render } from "@react-email/render"
import { createElement } from "react"

import { BroadcastEmail, type EmailFooter } from "@/emails/broadcast-email"
import { createUnsubscribeToken, listUnsubscribeHeaders } from "@/lib/unsubscribe-token"

import type { EmailContent } from "./blocks"

export type SendConfig = {
  from: string
  replyTo?: string
  brandName: string
  postalAddress: string
  appUrl: string
  unsubscribeSecret: string
}

type Env = Record<string, string | undefined>

const DEFAULT_BRAND_NAME = "Old Mountain Tours & Explorations"
const DEFAULT_FALLBACK = "there"

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
  if (realRecipients && !env.SENDER_REPLY_TO?.trim()) {
    blockers.push("Set SENDER_REPLY_TO to an inbox you read. Emails come from a sending-only address, so replies would be lost.")
  }
  return blockers
}

export function sendConfig(env: Env = process.env): SendConfig {
  const blockers = sendBlockers(env, { realRecipients: false })
  if (blockers.length > 0) throw new Error(blockers.join(" "))
  return {
    from: env.SENDER_FROM as string,
    replyTo: env.SENDER_REPLY_TO?.trim() || undefined,
    brandName: env.BRAND_NAME || DEFAULT_BRAND_NAME,
    postalAddress: env.SENDER_POSTAL_ADDRESS as string,
    appUrl: env.APP_URL as string,
    unsubscribeSecret: env.UNSUBSCRIBE_TOKEN_SECRET as string,
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")

const MERGE_TAG = /\{\{\s*first_name\s*(?:\|([^}]*))?\}\}/g

// {{first_name|friends and family}} becomes their first name, or the words after the bar when
// there isn't one. Names come from form answers, so they're escaped on their way into HTML.
export function applyMergeTags(value: string, firstName: string | null, { html }: { html: boolean }) {
  const name = firstName?.trim()
  return value.replace(MERGE_TAG, (_, fallback?: string) => {
    if (name) return html ? escapeHtml(name) : name
    return fallback?.replace(/\s+/g, " ").trim() || DEFAULT_FALLBACK
  })
}

async function renderBoth(content: EmailContent, preheader: string | null, footer: EmailFooter, editing = false) {
  const element = createElement(BroadcastEmail, { content, preheader, footer, editing })
  return { html: await render(element), text: await render(element, { plainText: true }) }
}

// For the editor. The footer shows what's missing rather than hiding it.
export async function previewHtml(content: EmailContent, preheader: string | null, env: Env = process.env) {
  const { html } = await renderBoth(
    content,
    preheader,
    {
      brandName: env.BRAND_NAME || DEFAULT_BRAND_NAME,
      postalAddress: env.SENDER_POSTAL_ADDRESS?.trim() || "[Postal address not set yet]",
      unsubscribeUrl: `${env.APP_URL ?? ""}/unsubscribe`,
      appUrl: env.APP_URL ?? "",
    },
    true
  )
  return applyMergeTags(html, null, { html: true })
}

export type ComposeInput = { subject: string | null; preheader: string | null; content: EmailContent }

// The same call for every recipient, so a retried batch sends an identical payload.
export async function composeEmail(
  { subject, preheader, content }: ComposeInput,
  recipient: { id: string; email: string; firstName: string | null },
  config: SendConfig,
  { subjectPrefix = "" }: { subjectPrefix?: string } = {}
) {
  const token = createUnsubscribeToken(recipient.id, config.unsubscribeSecret)
  const { html, text } = await renderBoth(content, preheader, {
    brandName: config.brandName,
    postalAddress: config.postalAddress,
    unsubscribeUrl: `${config.appUrl}/unsubscribe?token=${token}`,
    appUrl: config.appUrl,
  })
  return {
    from: config.from,
    to: [recipient.email],
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    subject: `${subjectPrefix}${applyMergeTags(subject ?? "", recipient.firstName, { html: false })}`,
    html: applyMergeTags(html, recipient.firstName, { html: true }),
    text: applyMergeTags(text, recipient.firstName, { html: false }),
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
  subscribers: { email: string | null; first_name: string | null; unsubscribed_at: string | null; suppressed: boolean }
}

// Someone can unsubscribe after the audience was resolved. Check again just before sending.
export function splitBatch(rows: QueuedSend[]) {
  const optedOut = (row: QueuedSend) =>
    !row.subscribers.email || Boolean(row.subscribers.unsubscribed_at) || row.subscribers.suppressed
  return {
    recipients: rows.filter((row) => !optedOut(row)).map((row) => ({
      sendId: row.id,
      subscriberId: row.subscriber_id,
      email: row.subscribers.email as string,
      firstName: row.subscribers.first_name,
    })),
    optedOutSendIds: rows.filter(optedOut).map((row) => row.id),
  }
}
