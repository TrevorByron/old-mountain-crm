import { describe, expect, it } from "vitest"

import { cleanSegments, planSync, splitName, type AirtableContact, type ExistingSubscriber } from "./sync-plan"

const STATUSES = ["New", "Connected With", "Emailed", "Pre-payment", "Paid"]

function contact(overrides: Partial<AirtableContact> = {}): AirtableContact {
  return {
    recordId: "recMaraOkafor0001",
    createdTime: "2026-06-24T00:46:49.000Z",
    name: "Mara Okafor",
    email: "mara.okafor@example.com",
    status: "New",
    segments: ["Leads - 2027"],
    source: "Instagram",
    phone: null,
    accountOwner: null,
    tripType: "Group",
    departureWindow: "July 2027",
    groupSize: null,
    interests: ["Wildlife photography"],
    interestsOther: null,
    objections: [],
    objectionsOther: null,
    ...overrides,
  }
}

function subscriber(overrides: Partial<ExistingSubscriber> = {}): ExistingSubscriber {
  return {
    id: "sub-mara",
    email: "mara.okafor@example.com",
    first_name: "Mara",
    last_name: "Okafor",
    status: "New",
    source: "Instagram",
    segments: ["Leads - 2027"],
    airtable_record_id: "recMaraOkafor0001",
    airtable_push_pending: false,
    phone: null,
    account_owner: null,
    trip_type: "Group",
    departure_window: "July 2027",
    group_size: null,
    interests: ["Wildlife photography"],
    interests_other: null,
    objections: [],
    objections_other: null,
    ...overrides,
  }
}

describe("planSync", () => {
  it("copies form answers on create, trimming Airtable's stray spaces", () => {
    const plan = planSync(
      [contact({ accountOwner: "Trevor ", interests: ["Tented Camps ", "Tented Camps"], objectionsOther: "  " })],
      [],
      STATUSES
    )
    expect(plan.creates[0]).toMatchObject({
      account_owner: "Trevor",
      trip_type: "Group",
      interests: ["Tented Camps"],
      objections_other: null,
    })
  })

  it("updates a contact when only a form answer changed", () => {
    const plan = planSync([contact({ interests: ["New foods"], groupSize: "2 people" })], [subscriber()], STATUSES)
    expect(plan.unchanged).toBe(0)
    expect(plan.updates[0].changed).toEqual(["group_size", "interests"])
  })

  it("never copies the opt-out checkbox", () => {
    const plan = planSync([contact()], [], STATUSES)
    expect(plan.creates[0]).not.toHaveProperty("unsubscribed_at")
    expect(plan.creates[0]).not.toHaveProperty("suppressed")
  })

  it("creates new contacts and keeps the original signup date", () => {
    const plan = planSync([contact()], [], STATUSES)
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0].subscribed_at).toBe("2026-06-24T00:46:49.000Z")
    expect(plan.creates[0].first_name).toBe("Mara")
  })

  it("leaves matching contacts alone", () => {
    const plan = planSync([contact()], [subscriber()], STATUSES)
    expect(plan.unchanged).toBe(1)
    expect(plan.updates).toEqual([])
    expect(plan.creates).toEqual([])
  })

  it("never includes opt-out columns in anything it writes", () => {
    const plan = planSync(
      [contact({ status: "Paid" }), contact({ recordId: "recDaviQuinn00002", email: "davi.quinn@example.com" })],
      [subscriber()],
      STATUSES
    )
    const written = [...plan.creates, ...plan.updates.map((update) => update.fields)]
    expect(written).toHaveLength(2)
    for (const row of written) {
      expect(row).not.toHaveProperty("unsubscribed_at")
      expect(row).not.toHaveProperty("suppressed")
      expect(row).not.toHaveProperty("suppressed_reason")
    }
  })

  it("matches a re-added row to the existing subscriber instead of creating a fresh one", () => {
    const plan = planSync(
      [contact({ recordId: "recMaraReadded0002", email: "MARA.OKAFOR@example.com" })],
      [subscriber()],
      STATUSES
    )
    expect(plan.creates).toEqual([])
    expect(plan.updates[0].id).toBe("sub-mara")
    expect(plan.updates[0].changed).toEqual(["airtable_record_id"])
  })

  it("follows an email edit on a linked record", () => {
    const plan = planSync([contact({ email: "mara@okaforstudio.example.com" })], [subscriber()], STATUSES)
    expect(plan.updates[0].changed).toEqual(["email"])
  })

  it("skips contacts with missing or invalid emails", () => {
    const plan = planSync(
      [contact({ recordId: "recA", email: null }), contact({ recordId: "recB", email: "not an email" })],
      [],
      STATUSES
    )
    expect(plan.creates).toEqual([])
    expect(plan.skipped.map((row) => row.reason)).toEqual(["no_email", "invalid_email"])
  })

  it("dedupes by email, case-insensitively, keeping the oldest record", () => {
    const plan = planSync(
      [
        contact({ recordId: "recNewer", createdTime: "2026-10-14T00:00:00.000Z", email: "MARA.OKAFOR@example.com" }),
        contact({ recordId: "recOlder", createdTime: "2026-06-01T00:00:00.000Z" }),
      ],
      [],
      STATUSES
    )
    expect(plan.creates.map((row) => row.airtable_record_id)).toEqual(["recOlder"])
    expect(plan.skipped).toMatchObject([{ recordId: "recNewer", reason: "duplicate_email" }])
  })

  it("won't move a linked record onto an email another subscriber owns", () => {
    const plan = planSync(
      [contact({ email: "davi.quinn@example.com" })],
      [subscriber(), subscriber({ id: "sub-davi", email: "davi.quinn@example.com", airtable_record_id: "recDavi" })],
      STATUSES
    )
    expect(plan.updates).toEqual([])
    expect(plan.skipped[0].reason).toBe("duplicate_email")
  })

  it("doesn't overwrite an app edit that hasn't reached Airtable yet", () => {
    const plan = planSync(
      [contact({ status: "New" })],
      [subscriber({ status: "Paid", airtable_push_pending: true })],
      STATUSES
    )
    expect(plan.updates).toEqual([])
    expect(plan.skipped[0].reason).toBe("pending_app_change")
  })

  it("reports unknown statuses and keeps the current one", () => {
    const plan = planSync([contact({ status: "Waitlist" })], [subscriber({ status: "Paid" })], STATUSES)
    expect(plan.unknownStatuses).toEqual(["Waitlist"])
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it("does nothing to subscribers whose Airtable row is gone", () => {
    const plan = planSync([], [subscriber()], STATUSES)
    expect(plan).toMatchObject({ creates: [], updates: [], unchanged: 0, skipped: [] })
  })
})

describe("splitName", () => {
  it("splits on the first space and tolerates empties", () => {
    expect(splitName("Mara Okafor")).toEqual({ first_name: "Mara", last_name: "Okafor" })
    expect(splitName("Mary Ann van der Berg")).toEqual({ first_name: "Mary", last_name: "Ann van der Berg" })
    expect(splitName("Cher")).toEqual({ first_name: "Cher", last_name: null })
    expect(splitName("  ")).toEqual({ first_name: null, last_name: null })
    expect(splitName(null)).toEqual({ first_name: null, last_name: null })
  })
})

describe("cleanSegments", () => {
  it("trims option names and drops email addresses entered as segments", () => {
    expect(cleanSegments(["Friends and Family ", "Past Clients ", "someone@example.com"])).toEqual([
      "Friends and Family",
      "Past Clients",
    ])
  })
})
