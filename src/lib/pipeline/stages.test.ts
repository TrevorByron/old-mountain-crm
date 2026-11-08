import { describe, expect, it } from "vitest"

import { formatMoney, isEarlyStage, nextMove, parseMoney, planAttention, prepProgress, PREP_KEYS, seatsTaken, summarizePayments, type AttentionInput } from "./stages"

const TODAY = "2026-11-08"
const TERMS = { agreed_total: 10900, deposit_amount: 3000, deposit_due_on: "2026-12-01", balance_due_on: "2027-08-01" }

describe("summarizePayments", () => {
  it("starts unpaid", () => {
    expect(summarizePayments(TERMS, [], TODAY)).toEqual({ paid: 0, balance: 10900, status: "not_paid", overdue: null })
  })

  it("counts a deposit against the total", () => {
    expect(summarizePayments(TERMS, [{ kind: "deposit", amount: 3000 }], TODAY)).toMatchObject({
      paid: 3000,
      balance: 7900,
      status: "deposit_paid",
    })
  })

  it("reaches paid in full", () => {
    const payments = [{ kind: "deposit", amount: 3000 }, { kind: "balance", amount: 7900 }]
    expect(summarizePayments(TERMS, payments, TODAY)).toMatchObject({ balance: 0, status: "paid_in_full" })
  })

  it("subtracts refunds", () => {
    const payments = [{ kind: "deposit", amount: 3000 }, { kind: "refund", amount: 1000 }]
    expect(summarizePayments(TERMS, payments, TODAY)).toMatchObject({ paid: 2000, balance: 8900 })
  })

  it("goes back to not paid after a full refund", () => {
    const payments = [{ kind: "deposit", amount: 3000 }, { kind: "refund", amount: 3000 }]
    expect(summarizePayments(TERMS, payments, TODAY)).toMatchObject({ paid: 0, status: "not_paid" })
  })

  it("flags overpayment", () => {
    expect(summarizePayments(TERMS, [{ kind: "balance", amount: 11000 }], TODAY)).toMatchObject({ balance: -100, status: "overpaid" })
  })

  it("doesn't drift on cents", () => {
    const payments = Array.from({ length: 10 }, () => ({ kind: "other", amount: 0.1 }))
    expect(summarizePayments({ ...TERMS, agreed_total: 1 }, payments, TODAY)).toMatchObject({ paid: 1, balance: 0, status: "paid_in_full" })
  })

  it("reads amounts that arrive from the database as text", () => {
    expect(summarizePayments({ ...TERMS, agreed_total: "10900.00" }, [{ kind: "deposit", amount: "3000.00" }], TODAY)).toMatchObject({
      paid: 3000,
      balance: 7900,
    })
  })

  it("shows what's been paid when no total is agreed yet", () => {
    expect(summarizePayments({ ...TERMS, agreed_total: null }, [{ kind: "deposit", amount: 500 }], TODAY)).toEqual({
      paid: 500,
      balance: null,
      status: "deposit_paid",
      overdue: null,
    })
    expect(summarizePayments({ ...TERMS, agreed_total: null }, [], TODAY).status).toBe("no_total")
  })

  it("flags a missed deposit date", () => {
    const terms = { ...TERMS, deposit_due_on: "2026-11-01" }
    expect(summarizePayments(terms, [], TODAY).overdue).toBe("deposit")
    expect(summarizePayments(terms, [{ kind: "deposit", amount: 3000 }], TODAY).overdue).toBeNull()
  })

  it("isn't overdue on the due date itself", () => {
    expect(summarizePayments({ ...TERMS, deposit_due_on: TODAY }, [], TODAY).overdue).toBeNull()
  })

  it("flags a missed balance date until it's fully paid", () => {
    const terms = { ...TERMS, balance_due_on: "2026-11-01" }
    expect(summarizePayments(terms, [{ kind: "deposit", amount: 3000 }], TODAY).overdue).toBe("balance")
    expect(summarizePayments(terms, [{ kind: "balance", amount: 10900 }], TODAY).overdue).toBeNull()
  })

  it("treats any payment as meeting a deposit with no set amount", () => {
    const terms = { ...TERMS, deposit_amount: null, deposit_due_on: "2026-11-01" }
    expect(summarizePayments(terms, [], TODAY).overdue).toBe("deposit")
    expect(summarizePayments(terms, [{ kind: "other", amount: 50 }], TODAY).overdue).toBeNull()
  })
})

describe("seatsTaken", () => {
  it("counts travelers once they've committed, not before, and not lost ones", () => {
    expect(
      seatsTaken([
        { stage: "talking", travelers: 2 },
        { stage: "proposal_sent", travelers: 4 },
        { stage: "committed", travelers: 2 },
        { stage: "ready", travelers: 1 },
        { stage: "traveled", travelers: 1 },
        { stage: "not_this_time", travelers: 3 },
      ])
    ).toBe(4)
  })
})

describe("planAttention", () => {
  const plan = (overrides: Partial<AttentionInput> = {}): AttentionInput => ({
    stage: "talking",
    next_step: "Call after the holidays",
    next_step_due: "2026-12-01",
    itinerary_status: "not_started",
    prep_done: [],
    trip: null,
    payments: [],
    agreed_total: null,
    deposit_amount: null,
    deposit_due_on: null,
    balance_due_on: null,
    ...overrides,
  })
  const messages = (input: AttentionInput) => planAttention(input, TODAY).map((reason) => reason.message)

  it("is quiet when things are on track", () => {
    expect(messages(plan())).toEqual([])
  })

  it("flags an open plan with no next step", () => {
    expect(messages(plan({ next_step: null, next_step_due: null }))).toEqual(["No next step"])
  })

  it("flags overdue and due-today next steps", () => {
    expect(messages(plan({ next_step_due: "2026-11-01" }))).toEqual(["Next step is overdue: Call after the holidays"])
    expect(messages(plan({ next_step_due: TODAY }))).toEqual(["Due today: Call after the holidays"])
  })

  it.each(["traveled", "not_this_time"])("leaves a closed plan alone at %s", (stage) => {
    expect(messages(plan({ stage, next_step: null, next_step_due: "2020-01-01", balance_due_on: "2020-01-01", agreed_total: 100 }))).toEqual([])
  })

  it("flags a committed plan with no total", () => {
    expect(messages(plan({ stage: "committed" }))).toEqual(["Committed with no agreed total"])
  })

  it("flags late money only once they've committed", () => {
    const late = { agreed_total: 100, balance_due_on: "2026-11-01" }
    expect(messages(plan({ stage: "committed", ...late }))).toEqual(["Balance is past due"])
    expect(messages(plan({ stage: "talking", ...late }))).toEqual([])
  })

  it("flags unfinished prep close to departure, not earlier", () => {
    const close = { stage: "committed", agreed_total: 100, trip: { kind: "group", starts_on: "2026-12-01" } }
    expect(messages(plan(close))).toEqual([`Departs in 23 days, prep is 0 of ${PREP_KEYS.length}`])
    expect(messages(plan({ ...close, prep_done: PREP_KEYS }))).toEqual([])
    expect(messages(plan({ ...close, trip: { kind: "group", starts_on: "2027-10-12" } }))).toEqual([])
  })

  it("flags an unapproved itinerary only on custom trips", () => {
    const close = { stage: "committed", agreed_total: 100, prep_done: PREP_KEYS }
    expect(messages(plan({ ...close, trip: { kind: "custom", starts_on: "2026-12-01" } }))).toEqual(["Departs in 23 days, itinerary isn't approved"])
    expect(messages(plan({ ...close, trip: { kind: "group", starts_on: "2026-12-01" } }))).toEqual([])
  })

  it("puts the most urgent first", () => {
    const reasons = planAttention(plan({ stage: "committed", agreed_total: 100, balance_due_on: "2026-11-01", next_step: null, next_step_due: null }), TODAY)
    expect(reasons.map((reason) => reason.severity)).toEqual(["overdue", "missing"])
  })
})

describe("nextMove", () => {
  it("walks a plan forward through the early stages", () => {
    expect(nextMove("talking", 0)).toMatchObject({ kind: "stage", stage: "planning" })
    expect(nextMove("planning", 0)).toMatchObject({ kind: "stage", stage: "proposal_sent" })
    expect(nextMove("proposal_sent", 0)).toMatchObject({ kind: "deposit" })
  })

  it("asks for the deposit until money has come in", () => {
    expect(nextMove("committed", 0)).toMatchObject({ kind: "deposit" })
    expect(nextMove("committed", 500)).toMatchObject({ kind: "stage", stage: "ready" })
  })

  it("finishes at traveled and has nothing to offer on closed plans", () => {
    expect(nextMove("ready", 500)).toMatchObject({ stage: "on_trip" })
    expect(nextMove("on_trip", 500)).toMatchObject({ stage: "traveled" })
    expect(nextMove("traveled", 500)).toBeNull()
    expect(nextMove("not_this_time", 0)).toBeNull()
  })
})

describe("isEarlyStage", () => {
  it("is only true before someone has committed", () => {
    expect(["talking", "planning", "proposal_sent"].every(isEarlyStage)).toBe(true)
    expect(["committed", "ready", "on_trip", "traveled", "not_this_time"].some(isEarlyStage)).toBe(false)
  })
})

describe("parseMoney", () => {
  it("reads amounts however they're typed", () => {
    expect(parseMoney("$3,000")).toBe(3000)
    expect(parseMoney(" 2500.50 ")).toBe(2500.5)
    expect(parseMoney("")).toBeNull()
    expect(parseMoney("about 3k")).toBeNaN()
  })
})

describe("small helpers", () => {
  it("counts prep and ignores unknown items", () => {
    expect(prepProgress(["guest_form", "visa", "something_old"])).toEqual({ done: 2, total: PREP_KEYS.length })
  })

  it("formats money", () => {
    expect(formatMoney(10900)).toBe("$10,900")
    expect(formatMoney("7900.50")).toBe("$7,900.50")
    expect(formatMoney(null)).toBe("-")
  })
})
