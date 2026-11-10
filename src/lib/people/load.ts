import type { requireTeamMember } from "@/lib/auth"

type Supabase = Awaited<ReturnType<typeof requireTeamMember>>["supabase"]

const PAGE_SIZE = 1000

export type SegmentTag = { id: string; name: string; color: string }

export type Person = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  lifecycle: string
  last_touch: string | null
  tags: string[]
  about: string | null
  interests: string[]
  marketing_ok: boolean
  unsubscribed_at: string | null
  suppressed: boolean
  suppressed_reason: string | null
  airtable_record_id: string | null
  segments: SegmentTag[]
}

const PERSON_COLUMNS =
  "id, email, first_name, last_name, phone, tags, about, interests, marketing_ok, unsubscribed_at, suppressed, suppressed_reason, airtable_record_id, subscribed_at"

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}

// Everyone, with what every people list shows: their relationship, last contact and the
// saved segments they're in. Newest on the list first.
export async function loadPeople(supabase: Supabase) {
  const [rows, lifecycles, touches, segments] = await Promise.all([
    readAll<Omit<Person, "lifecycle" | "last_touch" | "segments"> & { subscribed_at: string }>((from, to) =>
      supabase.from("subscribers").select(PERSON_COLUMNS).order("subscribed_at", { ascending: false }).order("id").range(from, to)
    ),
    readAll<{ subscriber_id: string; lifecycle: string }>((from, to) =>
      supabase.from("contact_lifecycle").select("subscriber_id, lifecycle").order("subscriber_id").range(from, to)
    ),
    readAll<{ subscriber_id: string; last_touch: string }>((from, to) =>
      supabase.from("contact_last_touch").select("subscriber_id, last_touch").order("subscriber_id").range(from, to)
    ),
    supabase.from("segments").select("id, name, color").order("name"),
  ])
  if (segments.error) throw new Error(segments.error.message)

  // Segments are few, so asking each one who's in it is cheaper than reproducing the rules here.
  const tags = new Map<string, SegmentTag[]>()
  await Promise.all(
    segments.data.map(async (segment) => {
      const members = await readAll<{ id: string }>((from, to) =>
        supabase.rpc("segment_subscribers", { target: segment.id }).select("id").order("id").range(from, to)
      )
      for (const member of members) tags.set(member.id, [...(tags.get(member.id) ?? []), segment])
    })
  )

  const lifecycleById = new Map(lifecycles.map((row) => [row.subscriber_id, row.lifecycle]))
  const touchById = new Map(touches.map((row) => [row.subscriber_id, row.last_touch]))
  const byName = (a: SegmentTag, b: SegmentTag) => a.name.localeCompare(b.name)

  const people: Person[] = rows.map((row) => ({
    ...row,
    lifecycle: lifecycleById.get(row.id) ?? "subscriber",
    last_touch: touchById.get(row.id) ?? null,
    segments: [...(tags.get(row.id) ?? [])].sort(byName),
  }))
  return { people, segments: segments.data as SegmentTag[] }
}
