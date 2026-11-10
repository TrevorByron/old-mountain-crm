import type { WebhookEventPayload } from "resend"
import { describe, expect, it } from "vitest"

import { isProbableBot, shouldRetryUnknownSend, toTrackedEvent, trackedEmailId } from "./events"

const SENT = "2026-11-09T16:00:00.000Z"
const LATER = "2026-11-09T17:00:00.000Z"
const event = (type: string, data: Record<string, unknown> = {}, created_at = LATER) =>
  ({ type, created_at, data: { email_id: "msg_1", ...data } }) as unknown as WebhookEventPayload

describe("toTrackedEvent", () => {
  it("records a delivery", () => {
    expect(toTrackedEvent(event("email.delivered"), SENT)).toMatchObject({ emailId: "msg_1", type: "delivered", suppress: null })
  })

  it("keeps the clicked link and its own time", () => {
    const click = { link: "https://old-mountain.com/trip", timestamp: "2026-11-09T18:00:00.000Z" }
    expect(toTrackedEvent(event("email.clicked", { click }), SENT)).toMatchObject({
      type: "clicked",
      linkUrl: click.link,
      occurredAt: click.timestamp,
      isProbableBot: false,
    })
  })

  it("flags an open or click right after sending as a likely bot", () => {
    const quick = "2026-11-09T16:00:02.000Z"
    expect(toTrackedEvent(event("email.opened", {}, quick), SENT)?.isProbableBot).toBe(true)
    const click = { link: "https://old-mountain.com", timestamp: quick }
    expect(toTrackedEvent(event("email.clicked", { click }), SENT)?.isProbableBot).toBe(true)
  })

  it("stops email after a permanent bounce, whatever the casing", () => {
    expect(toTrackedEvent(event("email.bounced", { bounce: { type: "Permanent" } }), SENT)?.suppress).toBe("hard_bounce")
    expect(toTrackedEvent(event("email.bounced", { bounce: { type: "permanent" } }), SENT)?.suppress).toBe("hard_bounce")
  })

  it("keeps emailing after a temporary bounce, but still records it", () => {
    expect(toTrackedEvent(event("email.bounced", { bounce: { type: "Transient" } }), SENT)).toMatchObject({ type: "bounced", suppress: null })
    expect(toTrackedEvent(event("email.bounced", {}), SENT)?.suppress).toBeNull()
  })

  it("stops email after a spam complaint", () => {
    expect(toTrackedEvent(event("email.complained"), SENT)).toMatchObject({ type: "complained", suppress: "complaint" })
  })

  it("treats a send Resend refused as a bounce", () => {
    expect(toTrackedEvent(event("email.suppressed", { suppressed: {} }), SENT)).toMatchObject({ type: "bounced", suppress: "hard_bounce" })
  })

  it("ignores events we don't track", () => {
    expect(toTrackedEvent(event("email.sent"), SENT)).toBeNull()
    expect(toTrackedEvent(event("email.delivery_delayed"), SENT)).toBeNull()
    expect(toTrackedEvent(event("domain.updated"), SENT)).toBeNull()
  })
})

describe("isProbableBot", () => {
  it("doesn't flag anything when the send time isn't known", () => {
    expect(isProbableBot(null, SENT)).toBe(false)
  })
})

describe("shouldRetryUnknownSend", () => {
  const now = Date.parse(LATER)

  it("retries while the event is fresh, since the message id may not be saved yet", () => {
    expect(shouldRetryUnknownSend("2026-11-09T16:55:00.000Z", now)).toBe(true)
  })

  it("gives up on older events, such as those from test sends", () => {
    expect(shouldRetryUnknownSend("2026-11-09T16:45:00.000Z", now)).toBe(false)
  })
})

describe("trackedEmailId", () => {
  it("only reads ids from email events", () => {
    expect(trackedEmailId(event("email.opened"))).toBe("msg_1")
    expect(trackedEmailId(event("domain.updated"))).toBeNull()
  })
})
