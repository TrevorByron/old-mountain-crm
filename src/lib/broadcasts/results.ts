import type { TimelineEntry } from "@/lib/pipeline/display"

export type ResultEvent = {
  id?: string
  type: string
  link_url: string | null
  occurred_at: string
  is_probable_bot: boolean
}

export type ResultSend = {
  id: string
  sent_at: string | null
  subscribers: { id: string; first_name: string | null; last_name: string | null; email: string | null; unsubscribed_at: string | null } | null
  email_events: ResultEvent[]
}

export type RecipientStatus = "complained" | "bounced" | "unsubscribed" | "clicked" | "opened" | "delivered" | "sent"

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  complained: "Marked as spam",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  clicked: "Clicked",
  opened: "Opened",
  delivered: "Delivered",
  sent: "Sent",
}

const humanEvents = (send: Pick<ResultSend, "email_events">) => send.email_events.filter((event) => !event.is_probable_bot)
const has = (send: Pick<ResultSend, "email_events">, type: string) => humanEvents(send).some((event) => event.type === type)

// Only counts as this campaign's unsubscribe if it happened after they were sent it.
const unsubscribedAfter = (send: ResultSend) =>
  Boolean(send.sent_at && send.subscribers?.unsubscribed_at && send.subscribers.unsubscribed_at >= send.sent_at)

export function recipientStatus(send: ResultSend): RecipientStatus {
  if (has(send, "complained")) return "complained"
  if (has(send, "bounced")) return "bounced"
  if (unsubscribedAfter(send)) return "unsubscribed"
  if (has(send, "clicked")) return "clicked"
  if (has(send, "opened")) return "opened"
  if (has(send, "delivered")) return "delivered"
  return "sent"
}

const isUnsubscribeLink = (url: string) => /\/(api\/)?unsubscribe(\/|\?|$)/.test(url)

export function summarizeResults(sends: ResultSend[]) {
  const sent = sends.filter((send) => send.sent_at)
  const count = (test: (send: ResultSend) => boolean) => sent.filter(test).length

  const clicksByLink = new Map<string, Set<string>>()
  for (const send of sent) {
    for (const event of humanEvents(send)) {
      if (event.type !== "clicked" || !event.link_url || isUnsubscribeLink(event.link_url)) continue
      if (!clicksByLink.has(event.link_url)) clicksByLink.set(event.link_url, new Set())
      clicksByLink.get(event.link_url)?.add(send.id)
    }
  }

  return {
    sent: sent.length,
    delivered: count((send) => has(send, "delivered")),
    opened: count((send) => has(send, "opened") || has(send, "clicked")),
    clicked: count((send) => has(send, "clicked")),
    bounced: count((send) => has(send, "bounced")),
    complained: count((send) => has(send, "complained")),
    unsubscribed: count(unsubscribedAfter),
    links: [...clicksByLink.entries()]
      .map(([url, people]) => ({ url, people: people.size }))
      .sort((a, b) => b.people - a.people || a.url.localeCompare(b.url)),
  }
}

// Out of those delivered, or those sent while delivery reports are still on their way.
export function rate(count: number, delivered: number, sent: number) {
  const base = delivered || sent
  return base === 0 ? null : Math.round((count / base) * 100)
}

const linkHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

// What a person did with an email, for their profile's timeline. One entry for the first open,
// since opening again adds nothing, and one for each link.
export function sendTimelineEntries(
  send: { id: string; subject: string | null; broadcast_id: string | null; email_events: ResultEvent[] }
): TimelineEntry[] {
  const subject = send.subject ?? "broadcast"
  const href = send.broadcast_id ? `/broadcasts/${send.broadcast_id}` : undefined
  const entry = (event: ResultEvent, title: string, detail: string | null = null): TimelineEntry => ({
    id: `${send.id}-${event.id ?? `${event.type}-${event.occurred_at}`}`,
    when: event.occurred_at,
    title,
    detail,
    author: null,
    href,
  })

  const events = humanEvents(send)
  const firstOpen = events.filter((event) => event.type === "opened").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0]
  return [
    ...(firstOpen ? [entry(firstOpen, `Opened: ${subject}`)] : []),
    ...events.flatMap((event) => {
      if (event.type === "clicked") {
        if (event.link_url && isUnsubscribeLink(event.link_url)) return []
        return [entry(event, `Clicked a link in: ${subject}`, event.link_url ? linkHost(event.link_url) : null)]
      }
      if (event.type === "bounced") return [entry(event, `Bounced: ${subject}`)]
      if (event.type === "complained") return [entry(event, `Marked as spam: ${subject}`)]
      return []
    }),
  ]
}
