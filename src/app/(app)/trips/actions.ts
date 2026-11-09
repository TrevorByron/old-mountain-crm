"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { ITINERARY_SOURCE_URL, nextDayLabel, parseItinerary, type ItineraryDay } from "@/lib/trips/itinerary"

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

const dayFieldsSchema = z.object({
  id: z.uuid(),
  tripId: z.uuid(),
  label: z.string().trim().max(80).optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  stay: z.string().trim().max(300).optional(),
})

export async function updateItineraryDay(input: unknown) {
  const parsed = dayFieldsSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { id, tripId, ...fields } = parsed.data
  const { error } = await supabase.from("trip_itinerary_days").update(fields).eq("id", id).eq("trip_id", tripId)
  if (error) return { ok: false as const, error: "Couldn't save that day." }
  refresh(tripId)
  return { ok: true as const }
}

export async function addItineraryDay(tripId: string) {
  if (!z.uuid().safeParse(tripId).success) return { ok: false as const, error: "Couldn't find that trip." }

  const { supabase } = await requireTeamMember()
  const { data: days, error: readError } = await supabase.from("trip_itinerary_days").select("label, position").eq("trip_id", tripId)
  if (readError) return { ok: false as const, error: "Couldn't add a day." }

  const position = days.reduce((highest, day) => Math.max(highest, day.position), -1) + 1
  const { error } = await supabase
    .from("trip_itinerary_days")
    .insert({ trip_id: tripId, position, label: nextDayLabel(days.map((day) => day.label)) })
  if (error) return { ok: false as const, error: "Couldn't add a day." }
  refresh(tripId)
  return { ok: true as const }
}

export async function removeItineraryDay(input: unknown) {
  const parsed = z.object({ id: z.uuid(), tripId: z.uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't remove that day." }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase.from("trip_itinerary_days").delete().eq("id", parsed.data.id).eq("trip_id", parsed.data.tripId)
  if (error) return { ok: false as const, error: "Couldn't remove that day." }
  refresh(parsed.data.tripId)
  return { ok: true as const }
}

export async function moveItineraryDay(input: unknown) {
  const parsed = z.object({ id: z.uuid(), tripId: z.uuid(), direction: z.union([z.literal(-1), z.literal(1)]) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't move that day." }

  const { supabase } = await requireTeamMember()
  const { id, tripId, direction } = parsed.data
  const { data: days, error: readError } = await supabase.from("trip_itinerary_days").select("id, position").eq("trip_id", tripId).order("position")
  if (readError) return { ok: false as const, error: "Couldn't move that day." }

  const index = days.findIndex((day) => day.id === id)
  const other = days[index + direction]
  if (index === -1 || !other) return { ok: true as const }

  const first = await supabase.from("trip_itinerary_days").update({ position: other.position }).eq("id", id)
  const second = first.error ? first : await supabase.from("trip_itinerary_days").update({ position: days[index].position }).eq("id", other.id)
  if (second.error) return { ok: false as const, error: "Couldn't move that day." }
  refresh(tripId)
  return { ok: true as const }
}

export async function clearItinerary(tripId: string) {
  if (!z.uuid().safeParse(tripId).success) return { ok: false as const, error: "Couldn't find that trip." }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase.from("trip_itinerary_days").delete().eq("trip_id", tripId)
  if (error) return { ok: false as const, error: "Couldn't clear the itinerary." }
  refresh(tripId)
  return { ok: true as const }
}

// The new days go in before the old ones come out, so a failure can't leave the trip with nothing.
export async function pullItineraryFromWebsite(tripId: string) {
  if (!z.uuid().safeParse(tripId).success) return { ok: false as const, error: "Couldn't find that trip." }

  const { supabase } = await requireTeamMember()
  let pulled: ItineraryDay[]
  try {
    const response = await fetch(ITINERARY_SOURCE_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return { ok: false as const, error: "The website didn't respond. Try again in a minute." }
    pulled = parseItinerary(await response.text())
  } catch {
    return { ok: false as const, error: "Couldn't reach the website. Try again in a minute." }
  }
  if (pulled.length === 0) return { ok: false as const, error: "Couldn't find the journey section on the website." }

  const { data: existing, error: readError } = await supabase.from("trip_itinerary_days").select("id").eq("trip_id", tripId)
  if (readError) return { ok: false as const, error: "Couldn't save the itinerary." }

  const { error: insertError } = await supabase
    .from("trip_itinerary_days")
    .insert(pulled.map((day, position) => ({ ...day, trip_id: tripId, position })))
  if (insertError) return { ok: false as const, error: "Couldn't save the itinerary." }

  if (existing.length > 0) {
    const { error: deleteError } = await supabase.from("trip_itinerary_days").delete().in("id", existing.map((day) => day.id))
    if (deleteError) return { ok: false as const, error: "The new days saved, but the old ones are still there. Remove them by hand." }
  }

  refresh(tripId)
  return { ok: true as const, days: pulled.length }
}
