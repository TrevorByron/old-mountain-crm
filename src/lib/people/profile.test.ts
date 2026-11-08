import { describe, expect, it } from "vitest"

import {
  companions,
  followUpState,
  journeySummary,
  lastContactLabel,
  needsStayingInTouch,
  parseTags,
  tripInterestSummary,
} from "./profile"

const TODAY = "2026-11-08"

describe("parseTags", () => {
  it("tidies, lowercases and drops repeats so tags stay matchable", () => {
    expect(parseTags(" Family, birder ,, FAMILY")).toEqual(["family", "birder"])
    expect(parseTags("  ")).toEqual([])
  })
})

describe("tripInterestSummary", () => {
  it("joins what they told the form, skipping blanks", () => {
    expect(tripInterestSummary({ trip_type: "Group", departure_window: "July 2027", group_size: null })).toBe("Group · July 2027")
    expect(tripInterestSummary({ trip_type: null, departure_window: null, group_size: null })).toBe("")
  })
})

describe("followUpState", () => {
  it("tells overdue, today and upcoming apart", () => {
    expect(followUpState(null, TODAY)).toBe("none")
    expect(followUpState("2026-11-01", TODAY)).toBe("overdue")
    expect(followUpState(TODAY, TODAY)).toBe("today")
    expect(followUpState("2026-12-01", TODAY)).toBe("upcoming")
  })
})

describe("lastContactLabel", () => {
  it.each([
    [null, "Never logged"],
    ["2026-11-08T10:00:00Z", "Today"],
    ["2026-11-07T10:00:00Z", "Yesterday"],
    ["2026-10-29T10:00:00Z", "10 days ago"],
    ["2026-05-08T10:00:00Z", "6 months ago"],
    ["2023-11-08T10:00:00Z", "3 years ago"],
  ])("%s reads as %s", (value, expected) => {
    expect(lastContactLabel(value, TODAY)).toBe(expected)
  })
})

describe("needsStayingInTouch", () => {
  const guest = { lifecycle: "past_guest", follow_up_on: null, last_touch: "2026-01-01T00:00:00Z" }

  it("flags a past guest nobody has spoken to in six months", () => {
    expect(needsStayingInTouch(guest, TODAY)).toBe(true)
    expect(needsStayingInTouch({ ...guest, last_touch: null }, TODAY)).toBe(true)
  })

  it("leaves alone a recent conversation or a planned follow-up", () => {
    expect(needsStayingInTouch({ ...guest, last_touch: "2026-10-01T00:00:00Z" }, TODAY)).toBe(false)
    expect(needsStayingInTouch({ ...guest, follow_up_on: "2027-01-01" }, TODAY)).toBe(false)
  })

  it("only applies to past guests", () => {
    expect(needsStayingInTouch({ ...guest, lifecycle: "subscriber" }, TODAY)).toBe(false)
    expect(needsStayingInTouch({ ...guest, lifecycle: "customer" }, TODAY)).toBe(false)
  })
})

describe("journeySummary", () => {
  const plan = (stage: string, overrides = {}) => ({
    stage,
    next_step: null,
    next_step_due: null,
    trips: { name: "Tanzania Beautiful", starts_on: "2027-10-12" },
    ...overrides,
  })

  it("counts trips taken and finds what's coming up", () => {
    const summary = journeySummary(
      [plan("traveled", { trips: { name: "Northern Circuit", starts_on: "2024-02-01" } }), plan("committed")],
      TODAY
    )
    expect(summary).toMatchObject({ tripsTaken: 1, upcomingTrip: "Tanzania Beautiful", openPlans: 1 })
  })

  it("doesn't call a trip upcoming until they've committed", () => {
    expect(journeySummary([plan("talking")], TODAY).upcomingTrip).toBeNull()
  })

  it("shows the soonest next step, and ignores closed plans", () => {
    const summary = journeySummary(
      [
        plan("talking", { next_step: "Later", next_step_due: "2027-01-01" }),
        plan("planning", { next_step: "Sooner", next_step_due: "2026-12-01" }),
        plan("not_this_time", { next_step: "Stale", next_step_due: "2020-01-01" }),
      ],
      TODAY
    )
    expect(summary).toMatchObject({ nextStep: "Sooner", nextStepDue: "2026-12-01", openPlans: 2 })
  })

  it("is empty for someone with no plans", () => {
    expect(journeySummary([], TODAY)).toEqual({ tripsTaken: 0, upcomingTrip: null, nextStep: null, nextStepDue: null, openPlans: 0 })
  })
})

describe("companions", () => {
  it("lists everyone they've shared a plan with, once, without themselves", () => {
    const person = (id: string) => ({ subscribers: { id } })
    const plans = [{ trip_plan_travelers: [person("me"), person("sam")] }, { trip_plan_travelers: [person("me"), person("sam"), person("lee")] }]
    expect(companions(plans, "me").map((item) => item.id)).toEqual(["sam", "lee"])
  })
})
