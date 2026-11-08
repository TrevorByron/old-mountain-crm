"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"

const blank = (value: string | null | undefined) => value?.trim() || null
const date = z
  .string()
  .nullish()
  .transform(blank)
  .refine((value) => !value || z.iso.date().safeParse(value).success, "Check the dates.")
const money = z.number().min(0).max(100_000_000).nullable()

const tripFields = z.object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Give the trip a name.").max(200),
    kind: z.enum(["group", "custom"]),
    starts_on: date,
    ends_on: date,
    seats: z.number().int().positive("Seats need to be above zero.").max(1000).nullable(),
    price_per_person: money,
    deposit_per_person: money,
    balance_due_on: date,
    notes: z.string().max(5000).nullish().transform(blank),
    archived: z.boolean().default(false),
})

const tripSchema = tripFields.refine((trip) => !trip.starts_on || !trip.ends_on || trip.starts_on <= trip.ends_on, "The trip ends before it starts.")

export async function saveTrip(input: unknown) {
  const parsed = tripSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { id, ...fields } = parsed.data
  const result = id
    ? await supabase.from("trips").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
    : await supabase.from("trips").insert(fields).select("id").single()
  if (result.error) return { ok: false as const, error: "Couldn't save the trip." }

  revalidatePath("/trips", "layout")
  revalidatePath("/pipeline", "layout")
  return { ok: true as const, id: result.data.id as string }
}

function refresh(id?: string) {
  revalidatePath("/trips", "layout")
  revalidatePath("/pipeline", "layout")
  revalidatePath("/today")
  if (id) revalidatePath(`/trips/${id}`)
}

const tripFieldSchema = tripFields.omit({ id: true, archived: true }).partial().extend({ id: z.uuid(), archived: z.boolean().optional() })

// Each field saves on its own, so a date is checked against whatever the other one is now.
export async function updateTrip(input: unknown) {
  const parsed = tripFieldSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { id, ...fields } = parsed.data
  if (fields.starts_on || fields.ends_on) {
    const { data: current, error: readError } = await supabase.from("trips").select("starts_on, ends_on").eq("id", id).single()
    if (readError) return { ok: false as const, error: "Couldn't save the trip." }
    const starts = fields.starts_on ?? current.starts_on
    const ends = fields.ends_on ?? current.ends_on
    if (starts && ends && starts > ends) return { ok: false as const, error: "The trip ends before it starts." }
  }

  const { error } = await supabase.from("trips").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't save the trip." }
  refresh(id)
  return { ok: true as const }
}

// Blanks the details. The name, dates and everyone on the trip stay.
export async function resetTrip(id: string) {
  return updateTrip({ id, seats: null, price_per_person: null, deposit_per_person: null, balance_due_on: null, notes: null })
}

export async function deleteTrip(id: string) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Couldn't find that trip." }

  const { supabase } = await requireTeamMember()
  const { count, error: countError } = await supabase.from("trip_plans").select("id", { count: "exact", head: true }).eq("trip_id", id)
  if (countError) return { ok: false as const, error: "Couldn't remove the trip." }
  if (count) {
    return { ok: false as const, error: `${count} trip plan${count === 1 ? " is" : "s are"} on this trip. Remove ${count === 1 ? "it" : "them"} first, or archive the trip.` }
  }

  const { error } = await supabase.from("trips").delete().eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't remove the trip." }
  refresh()
  return { ok: true as const }
}
