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

type Fields = Record<string, unknown>

async function addSubscriber(email: string, fields: Fields = {}) {
  const keys = ["email", ...Object.keys(fields)]
  const values = [email, ...Object.values(fields)]
  const placeholders = keys.map((_, index) => `$${index + 1}`)
  const { rows } = await db.query<{ id: string }>(
    `insert into subscribers (${keys.join(", ")}) values (${placeholders.join(", ")}) returning id`,
    values
  )
  return rows[0].id
}

async function addSegment(name: string, rules: object = {}) {
  const { rows } = await db.query<{ id: string }>(`insert into segments (name, rules) values ($1, $2) returning id`, [
    name,
    JSON.stringify(rules),
  ])
  return rows[0].id
}

async function segmentEmails(id: string) {
  const { rows } = await db.query<{ email: string }>(`select email from segment_subscribers($1) order by email`, [id])
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

describe("segment rules", () => {
  it("finds everyone interested in a 2027 safari", async () => {
    await addSubscriber("amara.diallo@example.com", { departure_window: "February 2027" })
    await addSubscriber("tomas.reyes@example.com", { departure_window: "October 2027" })
    await addSubscriber("june.park@example.com", { departure_window: "Not sure yet" })
    await addSubscriber("nia.brooks@example.com")

    const id = await addSegment("Interested in a 2027 safari", {
      departure_windows: ["February 2027", "July 2027", "October 2027"],
    })
    expect(await segmentEmails(id)).toEqual(["amara.diallo@example.com", "tomas.reyes@example.com"])
  })

  it("needs a match in every field that has values, and any value within a field", async () => {
    await addSubscriber("both@example.com", { status: "New", interests: ["Tented Camps", "New foods"] })
    await addSubscriber("status-only@example.com", { status: "New", interests: ["Safari Lodges"] })
    await addSubscriber("interest-only@example.com", { status: "Paid", interests: ["Tented Camps"] })

    const id = await addSegment("New and camping", { statuses: ["New"], interests: ["Tented Camps", "Hiking Kilimanjaro"] })
    expect(await segmentEmails(id)).toEqual(["both@example.com"])
  })

  it("matches keywords in what people wrote, ignoring case", async () => {
    await addSubscriber("written@example.com", { interests_other: "A trip with my FAMILY and two teens" })
    await addSubscriber("objection@example.com", { objections_other: "Is it safe with family?" })
    await addSubscriber("other@example.com", { interests_other: "Birding" })

    const id = await addSegment("Family", { keywords: ["family"] })
    expect(await segmentEmails(id)).toEqual(["objection@example.com", "written@example.com"])
  })

  it("treats keyword characters literally", async () => {
    await addSubscriber("percent@example.com", { interests_other: "100% ready" })
    await addSubscriber("other@example.com", { interests_other: "Ready soon" })

    const id = await addSegment("Literal", { keywords: ["100%"] })
    expect(await segmentEmails(id)).toEqual(["percent@example.com"])
  })

  it("matches nobody with no rules, instead of everybody", async () => {
    await addSubscriber("amara.diallo@example.com")
    const id = await addSegment("Empty")
    expect(await segmentEmails(id)).toEqual([])
    expect((await db.query(`select count_rule_matches('{}'::jsonb) as n`)).rows).toEqual([{ n: 0 }])
  })

  it("includes people added by hand alongside rule matches, without listing anyone twice", async () => {
    const byHand = await addSubscriber("added@example.com")
    const both = await addSubscriber("both@example.com", { group_size: "5 or more" })
    await addSubscriber("rule@example.com", { group_size: "5 or more" })
    await addSubscriber("neither@example.com")

    const id = await addSegment("Family", { group_sizes: ["5 or more"] })
    await db.query(`insert into segment_members (segment_id, subscriber_id) values ($1, $2), ($1, $3)`, [id, byHand, both])
    expect(await segmentEmails(id)).toEqual(["added@example.com", "both@example.com", "rule@example.com"])
  })
})

describe("broadcast audience", () => {
  it("reaches nobody when nothing is chosen", async () => {
    await addSubscriber("amara.diallo@example.com", { status: "New" })
    expect(await audience({})).toEqual([])
    expect(await audience({ statuses: [], airtable_segments: [], segment_ids: [] })).toEqual([])
  })

  it("reaches anyone in at least one choice, once", async () => {
    await addSubscriber("status@example.com", { status: "New" })
    await addSubscriber("airtable@example.com", { segments: ["Past Clients"] })
    await addSubscriber("saved@example.com", { departure_window: "July 2027" })
    await addSubscriber("all-three@example.com", { status: "New", segments: ["Past Clients"], departure_window: "July 2027" })
    await addSubscriber("none@example.com", { status: "Paid" })

    const segment = await addSegment("2027", { departure_windows: ["July 2027"] })
    expect(await audience({ statuses: ["New"], airtable_segments: ["Past Clients"], segment_ids: [segment] })).toEqual([
      "airtable@example.com",
      "all-three@example.com",
      "saved@example.com",
      "status@example.com",
    ])
  })

  it("leaves out unsubscribed and suppressed people, however they got in", async () => {
    const unsubscribed = await addSubscriber("unsubscribed@example.com", { status: "New", unsubscribed_at: "2026-10-01T00:00:00Z" })
    const bounced = await addSubscriber("bounced@example.com", { status: "New", suppressed: true, suppressed_reason: "hard_bounce" })
    const complained = await addSubscriber("complained@example.com", { status: "New", suppressed: true, suppressed_reason: "complaint" })
    await addSubscriber("ok@example.com", { status: "New" })

    const segment = await addSegment("By hand")
    for (const id of [unsubscribed, bounced, complained]) {
      await db.query(`insert into segment_members (segment_id, subscriber_id) values ($1, $2)`, [segment, id])
    }

    expect(await audience({ statuses: ["New"] })).toEqual(["ok@example.com"])
    expect(await audience({ segment_ids: [segment] })).toEqual([])
    expect((await db.query(`select count_broadcast_audience($1) as n`, [JSON.stringify({ statuses: ["New"] })])).rows).toEqual([{ n: 1 }])
  })

  it("ignores a saved segment that has since been deleted", async () => {
    await addSubscriber("amara.diallo@example.com", { status: "New" })
    expect(await audience({ segment_ids: ["7f3c1c1e-6a53-4a4e-9f51-0d7f1b2c3d4e"] })).toEqual([])
  })
})

describe("queue_broadcast_sends", () => {
  async function addBroadcast(filter: object) {
    const { rows } = await db.query<{ id: string }>(
      `insert into broadcasts (name, subject, audience_filter) values ('Short rains update', 'Seats left for July', $1) returning id`,
      [JSON.stringify(filter)]
    )
    return rows[0].id
  }
  const queue = async (id: string) =>
    (await db.query<{ n: number }>(`select queue_broadcast_sends($1) as n`, [id])).rows[0].n

  it("adds one row per eligible recipient, keyed for idempotency", async () => {
    const ok = await addSubscriber("ok@example.com", { status: "New" })
    await addSubscriber("unsubscribed@example.com", { status: "New", unsubscribed_at: "2026-10-01T00:00:00Z" })
    await addSubscriber("bounced@example.com", { status: "New", suppressed: true, suppressed_reason: "hard_bounce" })
    const id = await addBroadcast({ statuses: ["New"] })

    expect(await queue(id)).toBe(1)
    const { rows } = await db.query(`select subscriber_id, idempotency_key, subject, sent_at from sends`)
    expect(rows).toEqual([
      { subscriber_id: ok, idempotency_key: `broadcast:${id}:${ok}`, subject: "Seats left for July", sent_at: null },
    ])
  })

  it("adds nothing on a retry", async () => {
    await addSubscriber("ok@example.com", { status: "New" })
    const id = await addBroadcast({ statuses: ["New"] })

    expect(await queue(id)).toBe(1)
    expect(await queue(id)).toBe(0)
    expect((await db.query(`select id from sends`)).rows).toHaveLength(1)
  })

  it("isn't callable by signed-in users", async () => {
    const id = await addBroadcast({ statuses: ["New"] })
    await db.exec(`set role authenticated`)
    await expect(queue(id)).rejects.toThrow(/permission denied/)
    await db.exec(`reset role`)
  })
})
