import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { beforeEach, describe, expect, it } from "vitest"

const migrationsDir = join(__dirname, "migrations")
const migrations = readdirSync(migrationsDir)
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))

const SUPABASE_STUBS = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to authenticated, anon;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
`

let db: PGlite

async function person(email: string | null, fields: Record<string, unknown> = {}) {
  const keys = ["email", ...Object.keys(fields)]
  const values = [email, ...Object.values(fields)]
  const { rows } = await db.query<{ id: string }>(
    `insert into subscribers (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    values
  )
  return rows[0].id
}

async function trip(name = "Tanzania Short Rains") {
  const { rows } = await db.query<{ id: string }>(`insert into trips (name) values ($1) returning id`, [name])
  return rows[0].id
}

async function plan(subscriberIds: string[], stage = "talking", tripId: string | null = null) {
  const { rows } = await db.query<{ id: string }>(
    `insert into trip_plans (stage, trip_id, last_changed_by) values ($1, $2, 'trevor@example.com') returning id`,
    [stage, tripId]
  )
  for (const subscriberId of subscriberIds) {
    await db.query(`insert into trip_plan_travelers (trip_plan_id, subscriber_id) values ($1, $2)`, [rows[0].id, subscriberId])
  }
  return rows[0].id
}

async function lifecycle(id: string) {
  const { rows } = await db.query<{ lifecycle: string }>(`select lifecycle from contact_lifecycle where subscriber_id = $1`, [id])
  return rows[0].lifecycle
}

const setStage = (id: string, stage: string) =>
  db.query(`update trip_plans set stage = $2, last_changed_by = 'jesse@example.com' where id = $1`, [id, stage])

async function activityKinds(planId: string) {
  const { rows } = await db.query<{ kind: string; meta: Record<string, unknown>; author: string | null }>(
    `select kind, meta, author from activities where trip_plan_id = $1 order by occurred_at, id`,
    [planId]
  )
  return rows
}

async function segmentEmails(rules: object) {
  const { rows: segment } = await db.query<{ id: string }>(
    `insert into segments (name, rules) values ($1, $2) returning id`,
    [`Segment ${Math.random()}`, JSON.stringify(rules)]
  )
  const { rows } = await db.query<{ email: string }>(`select email from segment_subscribers($1) order by email`, [segment[0].id])
  return rows.map((row) => row.email)
}

async function audience(filter: object) {
  const { rows } = await db.query<{ email: string }>(`select email from broadcast_audience($1) order by email`, [
    JSON.stringify(filter),
  ])
  return rows.map((row) => row.email)
}

beforeEach(async () => {
  db = new PGlite({ extensions: { citext } })
  await db.exec(SUPABASE_STUBS)
  for (const migration of migrations) await db.exec(migration)
})

describe("contacts without an email", () => {
  it("can exist, more than one of them", async () => {
    await person(null, { first_name: "Amara" })
    await person(null, { first_name: "Tomas" })
    expect((await db.query(`select id from subscribers`)).rows).toHaveLength(2)
  })

  it("still can't share an email", async () => {
    await person("amara@example.com")
    await expect(person("AMARA@example.com")).rejects.toThrow(/unique/)
  })

  it("are never in a broadcast audience, even when they match", async () => {
    await person(null, { status: "New" })
    await person("june@example.com", { status: "New" })
    expect(await audience({ statuses: ["New"] })).toEqual(["june@example.com"])
  })

  it("aren't queued for a send", async () => {
    await person(null, { status: "New" })
    const { rows } = await db.query<{ id: string }>(
      `insert into broadcasts (name, subject, audience_filter) values ('Update', 'Hi', '{"statuses":["New"]}') returning id`
    )
    await db.query(`select queue_broadcast_sends($1)`, [rows[0].id])
    expect((await db.query(`select id from sends`)).rows).toHaveLength(0)
  })
})

describe("overall stage", () => {
  it("starts as subscriber", async () => {
    expect(await lifecycle(await person("amara@example.com"))).toBe("subscriber")
  })

  it.each([
    ["talking", "prospect"],
    ["planning", "prospect"],
    ["proposal_sent", "prospect"],
    ["committed", "customer"],
    ["ready", "customer"],
    ["on_trip", "customer"],
    ["traveled", "past_guest"],
    ["not_this_time", "subscriber"],
  ])("a plan at %s makes them %s", async (stage, expected) => {
    const id = await person("amara@example.com")
    await plan([id], stage)
    expect(await lifecycle(id)).toBe(expected)
  })

  it("keeps a returning guest as a past guest when a new inquiry starts", async () => {
    const id = await person("amara@example.com")
    await plan([id], "traveled")
    await plan([id], "talking")
    expect(await lifecycle(id)).toBe("past_guest")
  })

  it("corrects itself when a mistaken stage is corrected", async () => {
    const id = await person("amara@example.com")
    const planId = await plan([id], "traveled")
    await setStage(planId, "committed")
    expect(await lifecycle(id)).toBe("customer")
  })

  it("applies to everyone traveling on the plan", async () => {
    const [a, b] = [await person("amara@example.com"), await person(null, { first_name: "Sam" })]
    await plan([a, b], "committed")
    expect(await lifecycle(a)).toBe("customer")
    expect(await lifecycle(b)).toBe("customer")
  })
})

describe("the activity log", () => {
  it("records a new plan and every stage change, with who did it", async () => {
    const planId = await plan([await person("amara@example.com")])
    await setStage(planId, "committed")
    const rows = await activityKinds(planId)
    expect(rows.find((row) => row.kind === "plan")).toMatchObject({ author: "trevor@example.com" })
    expect(rows.find((row) => row.kind === "stage")).toMatchObject({ meta: { from: "talking", to: "committed" }, author: "jesse@example.com" })
  })

  it("logs nothing when the stage didn't change", async () => {
    const planId = await plan([await person("amara@example.com")])
    await db.query(`update trip_plans set next_step = 'Call them' where id = $1`, [planId])
    expect(await activityKinds(planId)).toHaveLength(1)
  })

  it("records itinerary changes", async () => {
    const planId = await plan([await person("amara@example.com")])
    await db.query(`update trip_plans set itinerary_status = 'sent' where id = $1`, [planId])
    expect((await activityKinds(planId)).find((row) => row.kind === "itinerary")).toMatchObject({ meta: { from: "not_started", to: "sent" } })
  })

  it("records payments going in and coming out", async () => {
    const planId = await plan([await person("amara@example.com")])
    const { rows } = await db.query<{ id: string }>(
      `insert into payments (trip_plan_id, kind, amount, paid_on, recorded_by) values ($1, 'deposit', 3000, '2026-11-01', 'heather@example.com') returning id`,
      [planId]
    )
    await db.query(`delete from payments where id = $1`, [rows[0].id])
    const logged = (await activityKinds(planId)).filter((row) => row.kind === "payment")
    expect(logged.find((row) => row.meta.action === "recorded")).toMatchObject({ meta: { kind: "deposit", amount: 3000 }, author: "heather@example.com" })
    expect(logged.find((row) => row.meta.action === "removed")).toMatchObject({ meta: { kind: "deposit", amount: 3000 } })
  })

  it("deleting a plan takes its payments and log with it, cleanly", async () => {
    const planId = await plan([await person("amara@example.com")])
    await db.query(`insert into payments (trip_plan_id, kind, amount, paid_on) values ($1, 'deposit', 3000, '2026-11-01')`, [planId])
    await db.query(`delete from trip_plans where id = $1`, [planId])
    expect((await db.query(`select id from payments`)).rows).toHaveLength(0)
    expect((await db.query(`select id from activities`)).rows).toHaveLength(0)
  })

  it("rejects a zero or negative payment", async () => {
    const planId = await plan([await person("amara@example.com")])
    await expect(
      db.query(`insert into payments (trip_plan_id, kind, amount, paid_on) values ($1, 'deposit', -5, '2026-11-01')`, [planId])
    ).rejects.toThrow()
  })
})

describe("retargeting segments", () => {
  it("finds past guests to resell to", async () => {
    await plan([await person("guest@example.com")], "traveled")
    await plan([await person("lead@example.com")], "talking")
    await person("list@example.com")
    expect(await segmentEmails({ lifecycles: ["past_guest"] })).toEqual(["guest@example.com"])
  })

  it("finds people at a given stage of any plan", async () => {
    await plan([await person("gone@example.com")], "not_this_time")
    await plan([await person("lead@example.com")], "talking")
    expect(await segmentEmails({ plan_stages: ["not_this_time"] })).toEqual(["gone@example.com"])
  })

  it("finds who joined a trip, and only once they've committed", async () => {
    const tripId = await trip()
    await plan([await person("in@example.com")], "committed", tripId)
    await plan([await person("maybe@example.com")], "talking", tripId)
    expect(await segmentEmails({ trips: [tripId] })).toEqual(["in@example.com"])
  })

  it("finds who hasn't booked a trip", async () => {
    const tripId = await trip()
    await plan([await person("in@example.com")], "committed", tripId)
    await plan([await person("maybe@example.com")], "talking", tripId)
    await person("list@example.com")
    expect(await segmentEmails({ not_on_trips: [tripId] })).toEqual(["list@example.com", "maybe@example.com"])
  })

  it("combines journey rules with interests", async () => {
    await plan([await person("a@example.com", { interests: ["Tented Camps"] })], "traveled")
    await plan([await person("b@example.com", { interests: ["New foods"] })], "traveled")
    expect(await segmentEmails({ lifecycles: ["past_guest"], interests: ["Tented Camps"] })).toEqual(["a@example.com"])
  })
})

describe("leaving people out of a send", () => {
  it("leaves out an overall stage", async () => {
    await plan([await person("booked@example.com", { status: "New" })], "committed")
    await person("list@example.com", { status: "New" })
    expect(await audience({ statuses: ["New"], exclude_lifecycles: ["customer"] })).toEqual(["list@example.com"])
  })

  it("leaves out a saved segment, even for someone who also matches a chosen one", async () => {
    const out = await person("out@example.com", { status: "New" })
    await person("in@example.com", { status: "New" })
    const { rows } = await db.query<{ id: string }>(`insert into segments (name) values ('Do not email') returning id`)
    await db.query(`insert into segment_members (segment_id, subscriber_id) values ($1, $2)`, [rows[0].id, out])
    expect(await audience({ statuses: ["New"], exclude_segment_ids: [rows[0].id] })).toEqual(["in@example.com"])
  })

  it("still never includes unsubscribed people", async () => {
    await person("gone@example.com", { status: "New", unsubscribed_at: "2026-10-01T00:00:00Z" })
    expect(await audience({ statuses: ["New"], exclude_lifecycles: [] })).toEqual([])
  })

  it("reaches nobody when only exclusions are set", async () => {
    await person("list@example.com", { status: "New" })
    expect(await audience({ exclude_lifecycles: ["customer"] })).toEqual([])
  })
})

describe("marketing permission", () => {
  it("keeps someone added by hand out of sends, even with an email and a match", async () => {
    await person("spouse@example.com", { status: "New", marketing_ok: false })
    await person("list@example.com", { status: "New" })
    expect(await audience({ statuses: ["New"] })).toEqual(["list@example.com"])
  })

  it("defaults to on for people who come through signup or Airtable", async () => {
    const id = await person("list@example.com")
    const { rows } = await db.query<{ marketing_ok: boolean }>(`select marketing_ok from subscribers where id = $1`, [id])
    expect(rows[0].marketing_ok).toBe(true)
  })
})

describe("tags and what the team knows", () => {
  it("segments on the team's own tags", async () => {
    await person("family@example.com", { tags: ["family"] })
    await person("other@example.com", { tags: ["birder"] })
    expect(await segmentEmails({ tags: ["family"] })).toEqual(["family@example.com"])
  })

  it("finds keywords in the team's notes as well as form answers", async () => {
    await person("noted@example.com", { about: "Has two teens, wants a FAMILY trip" })
    await person("other@example.com")
    expect(await segmentEmails({ keywords: ["family"] })).toEqual(["noted@example.com"])
  })

  it("lists the saved segments someone is in, by rule and by hand", async () => {
    const id = await person("amara@example.com", { tags: ["family"] })
    await db.query(`insert into segments (name, rules) values ('Families', '{"tags":["family"]}'), ('Birders', '{"tags":["birder"]}')`)
    const { rows } = await db.query<{ id: string }>(`insert into segments (name) values ('By hand') returning id`)
    await db.query(`insert into segment_members (segment_id, subscriber_id) values ($1, $2)`, [rows[0].id, id])
    const found = await db.query<{ name: string }>(`select name from person_segments($1) order by name`, [id])
    expect(found.rows.map((row) => row.name)).toEqual(["By hand", "Families"])
  })
})

describe("last contact", () => {
  async function lastTouch(id: string) {
    const { rows } = await db.query<{ last_touch: string }>(`select last_touch::text from contact_last_touch where subscriber_id = $1`, [id])
    return rows[0]?.last_touch ?? null
  }

  it("is empty until something happens", async () => {
    expect(await lastTouch(await person("amara@example.com"))).toBeNull()
  })

  it("counts conversations on their record and on their trip plans", async () => {
    const id = await person("amara@example.com")
    await db.query(`insert into activities (subscriber_id, kind, body, occurred_at) values ($1, 'call', 'Hi', '2026-03-01T00:00:00Z')`, [id])
    expect(await lastTouch(id)).toContain("2026-03-01")
    const planId = await plan([id])
    await db.query(`insert into activities (trip_plan_id, kind, body, occurred_at) values ($1, 'note', 'Hi', '2026-05-01T00:00:00Z')`, [planId])
    expect(await lastTouch(id)).toContain("2026-05-01")
  })

  it("counts emails that went out", async () => {
    const id = await person("amara@example.com")
    await db.query(`insert into sends (subscriber_id, idempotency_key, sent_at) values ($1, 'k', '2026-07-01T00:00:00Z')`, [id])
    expect(await lastTouch(id)).toContain("2026-07-01")
  })

  it("doesn't count admin changes as contact", async () => {
    const id = await person("amara@example.com")
    const planId = await plan([id], "committed")
    await setStage(planId, "ready")
    expect(await lastTouch(id)).toBeNull()
  })
})

describe("access", () => {
  it("blocks anonymous and non-team reads of money and plans", async () => {
    const planId = await plan([await person("amara@example.com")])
    await db.query(`insert into payments (trip_plan_id, kind, amount, paid_on) values ($1, 'deposit', 3000, '2026-11-01')`, [planId])
    await db.exec(`grant select on all tables in schema public to anon, authenticated; set role anon;`)
    for (const table of ["payments", "trip_plans", "trips", "activities", "trip_plan_travelers"]) {
      expect((await db.query(`select * from ${table}`)).rows, table).toHaveLength(0)
    }
    await db.exec(`reset role`)
  })

  it("seeds the documented 2027 group safari, with terms left blank", async () => {
    const { rows } = await db.query(`select name, starts_on::text, ends_on::text, seats, price_per_person::float as price, deposit_per_person from trips`)
    expect(rows).toEqual([{ name: "Tanzania Beautiful", starts_on: "2027-10-12", ends_on: "2027-10-23", seats: 12, price: 10900, deposit_per_person: null }])
  })
})
