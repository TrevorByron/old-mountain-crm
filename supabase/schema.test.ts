import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { beforeEach, describe, expect, it } from "vitest"

const migrationsDir = join(__dirname, "migrations")
const migrations = readdirSync(migrationsDir)
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))

// Supabase provides these on a real project.
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

async function addMara(extra = "") {
  const { rows } = await db.query<{ id: string }>(
    `insert into subscribers (email, first_name, status, last_changed_by ${extra ? ", unsubscribed_at" : ""})
     values ('mara.okafor@example.com', 'Mara', 'New', 'airtable_sync' ${extra}) returning id`
  )
  return rows[0].id
}

beforeEach(async () => {
  db = new PGlite({ extensions: { citext } })
  await db.exec(SUPABASE_STUBS)
  for (const migration of migrations) await db.exec(migration)
})

describe("status history", () => {
  it("records the initial status and every change, with who changed it", async () => {
    const id = await addMara()
    await db.query(`update subscribers set status = 'Paid', last_changed_by = 'trevor@example.com' where id = $1`, [id])
    const { rows } = await db.query(
      `select from_status, to_status, changed_by from subscriber_status_history where subscriber_id = $1 order by changed_at, from_status nulls first`,
      [id]
    )
    expect(rows).toEqual([
      { from_status: null, to_status: "New", changed_by: "airtable_sync" },
      { from_status: "New", to_status: "Paid", changed_by: "trevor@example.com" },
    ])
  })

  it("writes nothing when the status didn't change", async () => {
    const id = await addMara()
    await db.query(`update subscribers set first_name = 'Marah' where id = $1`, [id])
    const { rows } = await db.query(`select id from subscriber_status_history where subscriber_id = $1`, [id])
    expect(rows).toHaveLength(1)
  })
})

describe("opt-out protection", () => {
  it("rejects clearing unsubscribed_at", async () => {
    const id = await addMara(", now()")
    await expect(db.query(`update subscribers set unsubscribed_at = null where id = $1`, [id])).rejects.toThrow(
      /cannot be changed/
    )
  })

  it("rejects clearing suppressed", async () => {
    const id = await addMara()
    await db.query(`update subscribers set suppressed = true, suppressed_reason = 'complaint' where id = $1`, [id])
    await expect(db.query(`update subscribers set suppressed = false where id = $1`, [id])).rejects.toThrow(
      /cannot be cleared/
    )
  })

  it("still lets synced fields update on an unsubscribed contact", async () => {
    const id = await addMara(", now()")
    await db.query(`update subscribers set status = 'Paid', first_name = 'Marah' where id = $1`, [id])
    const { rows } = await db.query<{ status: string; unsubscribed_at: Date | null }>(
      `select status, unsubscribed_at from subscribers where id = $1`,
      [id]
    )
    expect(rows[0].status).toBe("Paid")
    expect(rows[0].unsubscribed_at).not.toBeNull()
  })

  it("allows a deliberate reversal inside a flagged transaction", async () => {
    const id = await addMara(", now()")
    await db.transaction(async (tx) => {
      await tx.exec(`set local app.allow_resubscribe = 'on'`)
      await tx.query(`update subscribers set unsubscribed_at = null where id = $1`, [id])
    })
    const { rows } = await db.query<{ unsubscribed_at: Date | null }>(
      `select unsubscribed_at from subscribers where id = $1`,
      [id]
    )
    expect(rows[0].unsubscribed_at).toBeNull()
  })
})

describe("constraints", () => {
  it("treats emails as case-insensitively unique", async () => {
    await addMara()
    await expect(db.query(`insert into subscribers (email) values ('MARA.OKAFOR@EXAMPLE.COM')`)).rejects.toThrow(
      /unique/
    )
  })

  it("requires a reason when suppressing", async () => {
    const id = await addMara()
    await expect(db.query(`update subscribers set suppressed = true where id = $1`, [id])).rejects.toThrow(
      /suppressed_needs_reason/
    )
  })

  it("carries a status rename through to subscribers", async () => {
    const id = await addMara()
    await db.query(`update statuses set value = 'Fresh Lead' where value = 'New'`)
    const { rows } = await db.query<{ status: string }>(`select status from subscribers where id = $1`, [id])
    expect(rows[0].status).toBe("Fresh Lead")
  })

  it("rejects duplicate idempotency keys", async () => {
    const id = await addMara()
    const insert = `insert into sends (subscriber_id, idempotency_key) values ($1, $2)`
    await db.query(insert, [id, `broadcast:1:${id}`])
    await expect(db.query(insert, [id, `broadcast:1:${id}`])).rejects.toThrow(/unique/)
  })
})

describe("rate limit", () => {
  it("allows up to the limit, then blocks", async () => {
    const check = async () =>
      (await db.query<{ ok: boolean }>(`select check_rate_limit('ip-hash', 2, 60) as ok`)).rows[0].ok
    expect([await check(), await check(), await check()]).toEqual([true, true, false])
  })
})

describe("row-level security", () => {
  async function as(role: string, email: string | null, sql: string) {
    return db.transaction(async (tx) => {
      await tx.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, anon`)
      await tx.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ email })}', true)`)
      await tx.exec(`set local role ${role}`)
      return tx.query(sql)
    })
  }

  beforeEach(async () => {
    await addMara()
    await db.query(`insert into team_members (email) values ('trevor@example.com')`)
  })

  it("lets a team member read, matching email case-insensitively", async () => {
    const { rows } = await as("authenticated", "TREVOR@example.com", `select email from subscribers`)
    expect(rows).toHaveLength(1)
  })

  it("hides everything from a signed-in non-member", async () => {
    const { rows } = await as("authenticated", "stranger@example.com", `select email from subscribers`)
    expect(rows).toEqual([])
  })

  it("hides everything from anonymous requests", async () => {
    const { rows } = await as("anon", null, `select email from subscribers`)
    expect(rows).toEqual([])
  })

  it("blocks non-members from writing", async () => {
    await expect(
      as("authenticated", "stranger@example.com", `insert into statuses (value) values ('Hacked')`)
    ).rejects.toThrow(/row-level security/)
  })

  it("keeps the rate limiter away from signed-in users", async () => {
    await expect(as("authenticated", "trevor@example.com", `select check_rate_limit('x', 1, 60)`)).rejects.toThrow(
      /permission denied/
    )
  })
})
