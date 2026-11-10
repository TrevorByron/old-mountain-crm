import { describe, expect, it } from "vitest"

import { rate, recipientStatus, sendTimelineEntries, summarizeResults, type ResultEvent, type ResultSend } from "./results"

const SENT = "2026-11-09T16:00:00.000Z"
const LATER = "2026-11-09T17:00:00.000Z"

const ev = (type: string, fields: Partial<ResultEvent> = {}): ResultEvent => ({
  type,
  link_url: null,
  occurred_at: LATER,
  is_probable_bot: false,
  ...fields,
})

let nextId = 0
const send = (events: ResultEvent[] = [], fields: Partial<ResultSend> = {}): ResultSend => ({
  id: `send-${(nextId += 1)}`,
  sent_at: SENT,
  subscribers: { id: "p", first_name: "A", last_name: null, email: "a@example.com", unsubscribed_at: null },
  email_events: events,
  ...fields,
})

describe("recipientStatus", () => {
  it("shows the furthest thing that happened", () => {
    expect(recipientStatus(send())).toBe("sent")
    expect(recipientStatus(send([ev("delivered")]))).toBe("delivered")
    expect(recipientStatus(send([ev("delivered"), ev("opened")]))).toBe("opened")
    expect(recipientStatus(send([ev("opened"), ev("clicked")]))).toBe("clicked")
  })

  it("puts problems ahead of engagement", () => {
    expect(recipientStatus(send([ev("clicked"), ev("complained")]))).toBe("complained")
    expect(recipientStatus(send([ev("delivered"), ev("bounced")]))).toBe("bounced")
  })

  it("ignores likely bots", () => {
    expect(recipientStatus(send([ev("delivered"), ev("clicked", { is_probable_bot: true })]))).toBe("delivered")
  })

  it("counts an unsubscribe only if it came after this send", () => {
    const person = { id: "p", first_name: null, last_name: null, email: null }
    expect(recipientStatus(send([], { subscribers: { ...person, unsubscribed_at: LATER } }))).toBe("unsubscribed")
    expect(recipientStatus(send([], { subscribers: { ...person, unsubscribed_at: "2026-01-01T00:00:00.000Z" } }))).toBe("sent")
  })
})

describe("summarizeResults", () => {
  it("counts people rather than events, and a click as an open", () => {
    const summary = summarizeResults([
      send([ev("delivered"), ev("opened"), ev("opened"), ev("clicked", { link_url: "https://a.com" })]),
      send([ev("delivered"), ev("clicked", { link_url: "https://a.com" }), ev("clicked", { link_url: "https://a.com" })]),
      send([ev("bounced")]),
    ])
    expect(summary).toMatchObject({ sent: 3, delivered: 2, opened: 2, clicked: 2, bounced: 1, complained: 0 })
    expect(summary.links).toEqual([{ url: "https://a.com", people: 2 }])
  })

  it("leaves out unsent rows, and unsubscribe links from the top links", () => {
    const summary = summarizeResults([
      send([], { sent_at: null }),
      send([ev("clicked", { link_url: "https://crm.old-mountain.com/api/unsubscribe?token=x" })]),
    ])
    expect(summary.sent).toBe(1)
    expect(summary.links).toEqual([])
  })
})

describe("rate", () => {
  it("uses delivered, or sent until delivery reports arrive", () => {
    expect(rate(1, 2, 4)).toBe(50)
    expect(rate(1, 0, 4)).toBe(25)
  })

  it("has no rate before anything is sent", () => {
    expect(rate(0, 0, 0)).toBeNull()
  })
})

describe("sendTimelineEntries", () => {
  const base = { id: "s1", subject: "News", broadcast_id: "b1" }

  it("shows the first open once and each click with its site", () => {
    const entries = sendTimelineEntries({
      ...base,
      email_events: [
        ev("delivered"),
        ev("opened", { id: "e2", occurred_at: "2026-11-09T18:00:00.000Z" }),
        ev("opened", { id: "e1", occurred_at: LATER }),
        ev("clicked", { id: "e3", link_url: "https://www.old-mountain.com/trip" }),
      ],
    })
    expect(entries.map((entry) => entry.title)).toEqual(["Opened: News", "Clicked a link in: News"])
    expect(entries[0]).toMatchObject({ when: LATER, href: "/broadcasts/b1" })
    expect(entries[1].detail).toBe("old-mountain.com")
  })

  it("shows problems, and leaves out bots and unsubscribe links", () => {
    const entries = sendTimelineEntries({
      ...base,
      email_events: [
        ev("opened", { is_probable_bot: true }),
        ev("clicked", { link_url: "https://crm.old-mountain.com/unsubscribe?token=x" }),
        ev("bounced"),
        ev("complained"),
      ],
    })
    expect(entries.map((entry) => entry.title)).toEqual(["Bounced: News", "Marked as spam: News"])
  })
})
