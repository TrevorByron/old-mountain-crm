import { describe, expect, it } from "vitest"

import { describeActivity, formatDate, personName, planTitle, sortTimeline } from "./display"

const person = (first_name: string | null, last_name: string | null = null, email: string | null = null) => ({
  id: "p",
  first_name,
  last_name,
  email,
})

describe("personName", () => {
  it("falls back from name to email to a label", () => {
    expect(personName(person("Amara", "Diallo"))).toBe("Amara Diallo")
    expect(personName(person(null, null, "amara@example.com"))).toBe("amara@example.com")
    expect(personName(person(null))).toBe("No name")
  })
})

describe("planTitle", () => {
  it("names the lead traveler first and counts the rest", () => {
    expect(
      planTitle({
        trip_plan_travelers: [
          { is_lead: false, subscribers: person("Sam") },
          { is_lead: true, subscribers: person("Amara", "Diallo") },
        ],
      })
    ).toBe("Amara Diallo + 1")
  })

  it("handles one traveler and none", () => {
    expect(planTitle({ trip_plan_travelers: [{ is_lead: true, subscribers: person("Amara") }] })).toBe("Amara")
    expect(planTitle({ trip_plan_travelers: [] })).toBe("No travelers yet")
  })
})

describe("describeActivity", () => {
  it("puts stage changes in words", () => {
    expect(describeActivity({ kind: "stage", body: null, meta: { from: "talking", to: "proposal_sent" } }).title).toBe(
      "Talking → Proposal sent"
    )
  })

  it("describes payments, and shows when one was removed", () => {
    expect(describeActivity({ kind: "payment", body: null, meta: { action: "recorded", kind: "deposit", amount: 3000 } }).title).toBe(
      "Deposit of $3,000"
    )
    expect(describeActivity({ kind: "payment", body: null, meta: { action: "removed", kind: "refund", amount: 50 } }).title).toBe(
      "Removed: Refund of $50"
    )
  })

  it("keeps a note's words as the detail", () => {
    expect(describeActivity({ kind: "call", body: "Wants July", meta: {} })).toEqual({ title: "Call", detail: "Wants July" })
  })
})

describe("sortTimeline", () => {
  it("puts the newest first without changing the input", () => {
    const entries = [
      { id: "a", when: "2026-01-01T00:00:00Z", title: "", detail: null, author: null },
      { id: "b", when: "2026-03-01T00:00:00Z", title: "", detail: null, author: null },
    ]
    expect(sortTimeline(entries).map((entry) => entry.id)).toEqual(["b", "a"])
    expect(entries[0].id).toBe("a")
  })
})

describe("formatDate", () => {
  it("shows the date as written, whatever the time zone", () => {
    expect(formatDate("2027-10-12")).toBe("Oct 12, 2027")
    expect(formatDate(null)).toBe("-")
  })
})

describe("describeActivity for payment changes", () => {
  it("marks corrections and removals so the money trail stays readable", () => {
    const entry = (action?: string) => describeActivity({ kind: "payment", body: null, meta: { kind: "deposit", amount: 2500, action } })
    expect(entry().title).toBe("Deposit of $2,500")
    expect(entry("edited").title).toBe("Changed to: Deposit of $2,500")
    expect(entry("removed").title).toBe("Removed: Deposit of $2,500")
  })
})
