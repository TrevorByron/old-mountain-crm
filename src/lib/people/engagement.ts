import { rate, type ResultEvent } from "@/lib/broadcasts/results"

// What one person has done with every email sent to them, for their Analytics tab.

export type EngagementEvent = ResultEvent & { user_agent?: string | null }
export type EngagementSend = { id: string; sent_at: string | null; email_events: EngagementEvent[] }
export type Device = "mobile" | "desktop"

const isUnsubscribeLink = (url: string) => /\/(api\/)?unsubscribe(\/|\?|$)/.test(url)

// Good enough to tell a phone from a computer. Gmail's image proxy reports a desktop browser,
// so opens in Gmail count as desktop, as they do in Flodesk.
export function deviceFor(userAgent: string | null | undefined): Device | null {
  if (!userAgent) return null
  return /iphone|ipad|ipod|android|mobile|windows phone/i.test(userAgent) ? "mobile" : "desktop"
}

function byDevice(events: EngagementEvent[]) {
  const counts = { mobile: 0, desktop: 0 }
  for (const event of events) {
    const device = deviceFor(event.user_agent)
    if (device) counts[device] += 1
  }
  const known = counts.mobile + counts.desktop
  return {
    ...counts,
    mobileShare: known === 0 ? null : Math.round((counts.mobile / known) * 100),
    desktopShare: known === 0 ? null : Math.round((counts.desktop / known) * 100),
  }
}

export function summarizeEngagement(sends: EngagementSend[]) {
  const sent = sends.filter((send) => send.sent_at)
  const human = (send: EngagementSend) => send.email_events.filter((event) => !event.is_probable_bot)
  const has = (send: EngagementSend, ...types: string[]) => human(send).some((event) => types.includes(event.type))

  const clicks = sent.flatMap((send) =>
    human(send)
      .filter((event) => event.type === "clicked" && !(event.link_url && isUnsubscribeLink(event.link_url)))
      .map((event) => ({ send: send.id, event }))
  )
  const opens = sent.flatMap((send) => human(send).filter((event) => event.type === "opened"))

  // An open or click proves the email arrived even when the delivery report is missing.
  const delivered = sent.filter((send) => has(send, "delivered", "opened", "clicked")).length
  const opened = sent.filter((send) => has(send, "opened", "clicked")).length
  const clickedSends = new Set(clicks.map((click) => click.send)).size

  return {
    sent: sent.length,
    delivered,
    opened,
    totalClicks: clicks.length,
    uniqueClicks: new Set(clicks.map((click) => `${click.send} ${click.event.link_url ?? ""}`)).size,
    openRate: rate(opened, delivered, sent.length),
    clickRate: rate(clickedSends, delivered, sent.length),
    opensByDevice: byDevice(opens),
    clicksByDevice: byDevice(clicks.map((click) => click.event)),
  }
}

export type Engagement = ReturnType<typeof summarizeEngagement>
