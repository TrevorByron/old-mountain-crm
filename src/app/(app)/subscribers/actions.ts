"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { pushToAirtable } from "@/lib/airtable/sync"
import { requireTeamMember } from "@/lib/auth"
import { unsubscribeSubscriber } from "@/lib/unsubscribe"

export type ActionResult = { ok: true; warning?: string } | { ok: false; error: string }

const AIRTABLE_DELAY_WARNING = "Saved here. Airtable will catch up on the next sync."

const optionalText = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value || null)

const emailField = z.union([z.literal("").transform(() => null), z.string().trim().toLowerCase().pipe(z.email())])

const subscriberSchema = z.object({
  id: z.uuid(),
  email: emailField,
  first_name: optionalText,
  last_name: optionalText,
  phone: optionalText,
  status: z.string().nullable(),
  country: optionalText,
  source: optionalText,
  account_owner: optionalText,
})

// Each field saves on its own, so only what changed is sent.
const subscriberFieldsSchema = subscriberSchema.partial().extend({ id: z.uuid() })
const AIRTABLE_FIELDS_PUSHED = ["email", "first_name", "last_name", "phone"]

export async function updateSubscriber(input: unknown): Promise<ActionResult> {
  const parsed = subscriberFieldsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Check the email address and try again." }

  const { supabase, member } = await requireTeamMember()
  const { id, ...fields } = parsed.data

  const { data: current, error: readError } = await supabase.from("subscribers").select("airtable_record_id").eq("id", id).single()
  if (readError) return { ok: false, error: "Couldn't save those changes." }
  // People added in the app stay here. Only Airtable's own contacts are written back to it.
  const linked = Boolean(current.airtable_record_id) && Object.keys(fields).some((field) => AIRTABLE_FIELDS_PUSHED.includes(field))

  const { error } = await supabase
    .from("subscribers")
    .update({ ...fields, ...(linked ? { airtable_push_pending: true } : {}), last_changed_by: member.email })
    .eq("id", id)
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Someone else already has that email." : "Couldn't save those changes.",
    }
  }

  const pushed = linked ? await pushToAirtable(id) : true
  revalidatePath("/subscribers")
  revalidatePath(`/subscribers/${id}`)
  return pushed ? { ok: true } : { ok: true, warning: AIRTABLE_DELAY_WARNING }
}

const newPersonSchema = z.object({
  first_name: z.string().trim().min(1, "Give them a first name.").max(100),
  last_name: optionalText,
  email: emailField,
  phone: optionalText,
  source: optionalText,
  marketing_ok: z.boolean().default(false),
})

export async function createPerson(input: unknown) {
  const parsed = newPersonSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { data, error } = await supabase
    .from("subscribers")
    .insert({ ...parsed.data, last_changed_by: member.email })
    .select("id")
    .single()
  if (error) {
    return { ok: false as const, error: error.code === "23505" ? "Someone already has that email. Search for them instead." : "Couldn't add them." }
  }
  revalidatePath("/subscribers")
  return { ok: true as const, id: data.id as string }
}

const profileSchema = z.object({
  id: z.uuid(),
  about: z.string().trim().max(20_000).nullable().transform((value) => value || null).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(60)).max(50).optional(),
  referred_by: optionalText.optional(),
  follow_up_on: z.iso.date().nullable().optional(),
  follow_up_note: z.string().trim().max(500).nullable().transform((value) => value || null).optional(),
  marketing_ok: z.boolean().optional(),
})

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Couldn't save that." }

  const { supabase, member } = await requireTeamMember()
  const { id, ...fields } = parsed.data
  const { error } = await supabase.from("subscribers").update({ ...fields, last_changed_by: member.email }).eq("id", id)
  if (error) return { ok: false, error: "Couldn't save that." }

  revalidatePath(`/subscribers/${id}`)
  revalidatePath("/subscribers")
  revalidatePath("/today")
  return { ok: true }
}

// Clears what the team wrote about them. Contact details, trips and the log stay.
export async function resetProfile(id: unknown): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { ok: false, error: "Couldn't find that person." }

  const { supabase, member } = await requireTeamMember()
  const { error } = await supabase
    .from("subscribers")
    .update({ about: null, tags: [], referred_by: null, follow_up_on: null, follow_up_note: null, last_changed_by: member.email })
    .eq("id", parsed.data)
  if (error) return { ok: false, error: "Couldn't reset their profile." }

  revalidatePath(`/subscribers/${parsed.data}`)
  revalidatePath("/subscribers")
  revalidatePath("/today")
  return { ok: true }
}

// An opt-out has to outlive the person's record: delete it and the next Airtable sync
// could bring them back as someone who can be emailed.
export async function removePerson(id: unknown): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { ok: false, error: "Couldn't find that person." }

  const { supabase } = await requireTeamMember()
  const { data: person, error: readError } = await supabase
    .from("subscribers")
    .select("unsubscribed_at, suppressed")
    .eq("id", parsed.data)
    .single()
  if (readError) return { ok: false, error: "Couldn't find that person." }
  if (person.unsubscribed_at || person.suppressed) {
    return { ok: false, error: "They've opted out, so their record has to stay. That's what keeps them from being emailed again." }
  }

  const { count, error: tripError } = await supabase
    .from("trip_plan_travelers")
    .select("subscriber_id", { count: "exact", head: true })
    .eq("subscriber_id", parsed.data)
  if (tripError) return { ok: false, error: "Couldn't remove them." }
  if (count) return { ok: false, error: "Remove them from their trips first, so no payments disappear by accident." }

  const { error } = await supabase.from("subscribers").delete().eq("id", parsed.data)
  if (error) return { ok: false, error: "Couldn't remove them." }

  revalidatePath("/subscribers")
  revalidatePath("/today")
  return { ok: true }
}

// For a whole selection at once. Each person goes through the same rules as doing it one by one,
// and the result says how many couldn't be done and why.
async function forEachPerson(ids: unknown, run: (id: string) => Promise<ActionResult>, verb: string): Promise<ActionResult> {
  const parsed = z.array(z.uuid()).min(1).max(5000).safeParse(ids)
  if (!parsed.success) return { ok: false, error: "Pick at least one person." }

  let firstError: string | null = null
  let skipped = 0
  for (const id of parsed.data) {
    const result = await run(id)
    if (!result.ok) {
      skipped += 1
      firstError ??= result.error
    }
  }
  if (skipped === 0) return { ok: true }
  const done = parsed.data.length - skipped
  return { ok: false, error: `${done > 0 ? `${verb} ${done}. ` : ""}${skipped === 1 ? "1 couldn't be" : `${skipped} couldn't be`}: ${firstError}` }
}

export async function removePeople(ids: unknown): Promise<ActionResult> {
  return forEachPerson(ids, removePerson, "Removed")
}

export async function unsubscribePeople(ids: unknown): Promise<ActionResult> {
  return forEachPerson(ids, markUnsubscribed, "Unsubscribed")
}

export type PersonHit = { id: string; name: string; email: string | null; lifecycle: string }

// Each word has to match somewhere, so "joan neal" finds Joan Neal.
export async function searchPeople(input: unknown): Promise<PersonHit[]> {
  const query = z.string().max(100).safeParse(input)
  if (!query.success) return []
  const words = query.data.replace(/[,()%*\\]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5)
  if (words.length === 0) return []

  const { supabase } = await requireTeamMember()
  let search = supabase.from("subscribers").select("id, first_name, last_name, email").limit(12)
  for (const word of words) {
    search = search.or(
      `first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,phone.ilike.%${word}%,tags.cs.{${word.toLowerCase()}}`
    )
  }
  const { data, error } = await search
  if (error) {
    console.error("Person search failed:", error.message)
    return []
  }

  const { data: stages } = await supabase
    .from("contact_lifecycle")
    .select("subscriber_id, lifecycle")
    .in("subscriber_id", data.map((row) => row.id))
  const lifecycles = new Map((stages ?? []).map((row) => [row.subscriber_id, row.lifecycle as string]))

  return data.map((row) => ({
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "No name",
    email: row.email,
    lifecycle: lifecycles.get(row.id) ?? "subscriber",
  }))
}

const bulkSchema = z.object({
  ids: z.array(z.uuid()).min(1),
  status: z.string().min(1),
})

export async function bulkChangeStatus(input: unknown): Promise<ActionResult> {
  const parsed = bulkSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Pick at least one person and a status." }

  const { supabase, member } = await requireTeamMember()
  const { ids, status } = parsed.data

  // The app owns status, so this has nothing to send to Airtable.
  const { error } = await supabase.from("subscribers").update({ status, last_changed_by: member.email }).in("id", ids)
  if (error) return { ok: false, error: "Couldn't change those statuses." }

  revalidatePath("/subscribers")
  return { ok: true }
}

// For opt-outs that arrive another way, such as someone replying to ask.
export async function markUnsubscribed(id: unknown): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { ok: false, error: "Couldn't find that person." }

  const { member } = await requireTeamMember()
  try {
    await unsubscribeSubscriber(parsed.data, member.email)
  } catch {
    return { ok: false, error: "Couldn't unsubscribe them. Try again." }
  }

  revalidatePath("/subscribers")
  return { ok: true }
}
