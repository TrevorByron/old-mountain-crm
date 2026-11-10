import { describe, expect, it } from "vitest"

import { deviceFor, summarizeEngagement, type EngagementEvent, type EngagementSend } from "./engagement"

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
const GMAIL = "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"

const event = (type: string, extra: Partial<EngagementEvent> = {}): EngagementEvent => ({
  type,
  link_url: null,
  occurred_at: "2026-11-10T10:02:00Z",
  is_probable_bot: false,
  ...extra,
})
const send = (id: string, events: EngagementEvent[], sent_at: string | null = "2026-11-10T10:01:00Z"): EngagementSend => ({ id, sent_at, email_events: events })

describe("deviceFor", () => {
  it("tells phones from computers", () => {
    expect(deviceFor(IPHONE)).toBe("mobile")
    expect(deviceFor(GMAIL)).toBe("desktop")
    expect(deviceFor(null)).toBeNull()
  })
})

describe("summarizeEngagement", () => {
  it("counts what one person did across their emails", () => {
    const summary = summarizeEngagement([
      send("a", [event("delivered"), event("opened", { user_agent: GMAIL }), event("clicked", { link_url: "https://x.com/a", user_agent: IPHONE }), event("clicked", { link_url: "https://x.com/a", user_agent: IPHONE })]),
      send("b", [event("delivered")]),
      send("c", [event("delivered"), event("opened", { is_probable_bot: true })]),
      send("draft", [], null),
    ])
    expect(summary).toMatchObject({ sent: 3, delivered: 3, opened: 1, totalClicks: 2, uniqueClicks: 1, openRate: 33, clickRate: 33 })
    expect(summary.opensByDevice).toMatchObject({ mobile: 0, desktop: 1, desktopShare: 100 })
    expect(summary.clicksByDevice).toMatchObject({ mobile: 2, mobileShare: 100 })
  })

  it("treats an open as proof of delivery and skips unsubscribe clicks", () => {
    const summary = summarizeEngagement([send("a", [event("opened"), event("clicked", { link_url: "https://crm.example.com/api/unsubscribe?token=x" })])])
    expect(summary).toMatchObject({ delivered: 1, opened: 1, totalClicks: 0, clickRate: 0 })
  })

  it("has no rates before anything is sent", () => {
    const summary = summarizeEngagement([])
    expect(summary.openRate).toBeNull()
    expect(summary.opensByDevice.mobileShare).toBeNull()
  })
})
