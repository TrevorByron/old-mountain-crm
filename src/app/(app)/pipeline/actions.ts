"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { ITINERARY_KEYS, PAYMENT_KIND_KEYS, PREP_ITEMS, STAGE_KEYS } from "@/lib/pipeline/stages"

const idSchema = z.uuid()
const dateSchema = z.iso.date()
const nullableDate = dateSchema.nullable()
const nullableMoney = z.number().min(0).max(100_000_000).nullable()
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null)

function refresh(planId?: string) {
  revalidatePath("/today")
  revalidatePath("/pipeline")
  revalidatePath("/trips", "layout")
  revalidatePath("/subscribers", "layout")
  if (planId) revalidatePath(`/pipeline/${planId}`)
}

const createSchema = z.object({
  subscriberId: z.uuid("Choose who this trip plan is for."),
  tripId: idSchema.nullable(),
  newTrip: z
    .object({ name: z.string().trim().min(1, "Name the trip.").max(200), starts_on: dateSchema.nullable() })
    .nullable()
    .optional(),
  stage: z.enum(STAGE_KEYS).default("talking"),
  owner: nullableText(80).optional(),
})

// Fills in the trip's price and terms as a starting point. They're this plan's own from
// then on, because a couple or a custom deal can differ.
export async function createPlan(input: unknown) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { subscriberId, newTrip, stage, owner } = parsed.data
  let { tripId } = parsed.data

  // A custom safari is often its own trip, including past ones being logged after the fact.
  if (newTrip) {
    const { data: created, error: tripError } = await supabase
      .from("trips")
      .insert({ name: newTrip.name, kind: "custom", starts_on: newTrip.starts_on })
      .select("id")
      .single()
    if (tripError) return { ok: false as const, error: "Couldn't create the trip." }
    tripId = created.id as string
  }

  let terms = {}
  if (tripId) {
    const { data: trip, error } = await supabase
      .from("trips")
      .select("price_per_person, deposit_per_person, balance_due_on")
      .eq("id", tripId)
      .single()
    if (error) return { ok: false as const, error: "Couldn't find that trip." }
    terms = { agreed_total: trip.price_per_person, deposit_amount: trip.deposit_per_person, balance_due_on: trip.balance_due_on }
  }

  const { data: plan, error } = await supabase
    .from("trip_plans")
    .insert({ trip_id: tripId, stage, owner: owner ?? null, last_changed_by: member.email, ...terms })
    .select("id")
    .single()
  if (error) return { ok: false as const, error: "Couldn't start the trip plan." }

  const { error: travelerError } = await supabase
    .from("trip_plan_travelers")
    .insert({ trip_plan_id: plan.id, subscriber_id: subscriberId, is_lead: true })
  if (travelerError) {
    await supabase.from("trip_plans").delete().eq("id", plan.id)
    return { ok: false as const, error: "Couldn't add them to the trip plan." }
  }

  refresh()
  return { ok: true as const, id: plan.id as string }
}

const updateSchema = z.object({
  id: idSchema,
  stage: z.enum(STAGE_KEYS).optional(),
  trip_id: idSchema.nullable().optional(),
  owner: nullableText(80).optional(),
  next_step: nullableText(500).optional(),
  next_step_due: nullableDate.optional(),
  itinerary_status: z.enum(ITINERARY_KEYS).optional(),
  itinerary_url: nullableText(2000)
    .refine((value) => !value || /^https?:\/\/\S+$/i.test(value), "Links need to start with http:// or https://.")
    .optional(),
  closed_reason: nullableText(500).optional(),
  agreed_total: nullableMoney.optional(),
  deposit_amount: nullableMoney.optional(),
  deposit_due_on: nullableDate.optional(),
  balance_due_on: nullableDate.optional(),
})

export async function updatePlan(input: unknown) {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { id, ...fields } = parsed.data
  const { error } = await supabase
    .from("trip_plans")
    .update({ ...fields, last_changed_by: member.email, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't save that change." }

  refresh(id)
  return { ok: true as const }
}

export async function deletePlan(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't delete the trip plan." }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase.from("trip_plans").delete().eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't delete the trip plan." }

  refresh()
  return { ok: true as const }
}

const travelerSchema = z.object({ planId: idSchema, subscriberId: idSchema })

export async function addTraveler(input: unknown) {
  const parsed = travelerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Choose someone to add." }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase
    .from("trip_plan_travelers")
    .upsert(
      { trip_plan_id: parsed.data.planId, subscriber_id: parsed.data.subscriberId },
      { onConflict: "trip_plan_id,subscriber_id", ignoreDuplicates: true }
    )
  if (error) return { ok: false as const, error: "Couldn't add them." }

  refresh(parsed.data.planId)
  return { ok: true as const }
}

const newTravelerSchema = z.object({
  planId: idSchema,
  firstName: z.string().trim().min(1, "Give them a first name.").max(100),
  lastName: z.string().trim().max(100),
})

// For someone traveling who isn't on the list, such as a spouse. They don't get email.
export async function addNewTraveler(input: unknown) {
  const parsed = newTravelerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { planId, firstName, lastName } = parsed.data
  const { data: person, error } = await supabase
    .from("subscribers")
    .insert({
      first_name: firstName,
      last_name: lastName || null,
      source: "Added to a trip plan",
      marketing_ok: false,
      last_changed_by: member.email,
    })
    .select("id")
    .single()
  if (error) return { ok: false as const, error: "Couldn't add them." }

  const { error: travelerError } = await supabase
    .from("trip_plan_travelers")
    .insert({ trip_plan_id: planId, subscriber_id: person.id })
  if (travelerError) return { ok: false as const, error: "Couldn't add them to the trip plan." }

  refresh(planId)
  return { ok: true as const }
}

export async function removeTraveler(input: unknown) {
  const parsed = travelerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't remove them." }

  const { supabase } = await requireTeamMember()
  const { planId, subscriberId } = parsed.data
  const { count, error: countError } = await supabase
    .from("trip_plan_travelers")
    .select("subscriber_id", { count: "exact", head: true })
    .eq("trip_plan_id", planId)
  if (countError) return { ok: false as const, error: "Couldn't remove them." }
  if ((count ?? 0) <= 1) return { ok: false as const, error: "A trip plan needs at least one traveler." }

  const { data: removed, error } = await supabase
    .from("trip_plan_travelers")
    .delete()
    .eq("trip_plan_id", planId)
    .eq("subscriber_id", subscriberId)
    .select("is_lead")
  if (error) return { ok: false as const, error: "Couldn't remove them." }

  // A plan always has a lead, because that's whose name it goes by.
  if (removed[0]?.is_lead) {
    const { data: next } = await supabase
      .from("trip_plan_travelers")
      .select("subscriber_id")
      .eq("trip_plan_id", planId)
      .order("added_at")
      .limit(1)
    if (next?.[0]) {
      await supabase
        .from("trip_plan_travelers")
        .update({ is_lead: true })
        .eq("trip_plan_id", planId)
        .eq("subscriber_id", next[0].subscriber_id)
    }
  }

  refresh(planId)
  return { ok: true as const }
}

const prepSchema = z.object({ planId: idSchema, item: z.string(), done: z.boolean() })

export async function setPrepItem(input: unknown) {
  const parsed = prepSchema.safeParse(input)
  const item = parsed.success ? PREP_ITEMS.find((prep) => prep.key === parsed.data.item) : null
  if (!parsed.success || !item) return { ok: false as const, error: "Couldn't update that item." }

  const { supabase, member } = await requireTeamMember()
  const { planId, done } = parsed.data
  const { data: plan, error: readError } = await supabase.from("trip_plans").select("prep_done").eq("id", planId).single()
  if (readError) return { ok: false as const, error: "Couldn't update that item." }

  const current: string[] = plan.prep_done
  const next = done ? [...new Set([...current, item.key])] : current.filter((key) => key !== item.key)
  const { error } = await supabase.from("trip_plans").update({ prep_done: next, last_changed_by: member.email }).eq("id", planId)
  if (error) return { ok: false as const, error: "Couldn't update that item." }

  await supabase.from("activities").insert({
    trip_plan_id: planId,
    kind: "prep",
    body: `${item.label}${done ? "" : " (unchecked)"}`,
    author: member.email,
  })

  refresh(planId)
  return { ok: true as const }
}

const paymentSchema = z.object({
  planId: idSchema,
  kind: z.enum(PAYMENT_KIND_KEYS),
  amount: z.number().positive("Enter an amount above zero.").max(100_000_000),
  paid_on: dateSchema,
  method: nullableText(80),
  note: nullableText(500),
})

export async function addPayment(input: unknown) {
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { planId, ...fields } = parsed.data
  const { error } = await supabase.from("payments").insert({ trip_plan_id: planId, ...fields, recorded_by: member.email })
  if (error) return { ok: false as const, error: "Couldn't record the payment." }

  refresh(planId)
  return { ok: true as const }
}

const removePaymentSchema = z.object({ planId: idSchema, id: idSchema })

export async function deletePayment(input: unknown) {
  const parsed = removePaymentSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't remove the payment." }

  const { supabase, member } = await requireTeamMember()
  const { id, planId } = parsed.data
  // The log entry for a removal credits recorded_by, so this says who removed it.
  await supabase.from("payments").update({ recorded_by: member.email }).eq("id", id)
  const { error } = await supabase.from("payments").delete().eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't remove the payment." }

  refresh(planId)
  return { ok: true as const }
}

const noteSchema = z
  .object({
    subscriberId: idSchema.nullable(),
    planId: idSchema.nullable(),
    kind: z.enum(["note", "call", "email", "meeting"]),
    body: z.string().trim().min(1, "Write something first.").max(10_000),
  })
  .refine((value) => value.subscriberId || value.planId, "Couldn't save that note.")

export async function addNote(input: unknown) {
  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { subscriberId, planId, kind, body } = parsed.data
  const { error } = await supabase
    .from("activities")
    .insert({ subscriber_id: subscriberId, trip_plan_id: planId, kind, body, author: member.email })
  if (error) return { ok: false as const, error: "Couldn't save that note." }

  refresh(planId ?? undefined)
  return { ok: true as const }
}

// Only conversations someone typed. The automatic history of stages and payments stays.
export async function deleteNote(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't delete that." }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase.from("activities").delete().eq("id", id).in("kind", ["note", "call", "email", "meeting"])
  if (error) return { ok: false as const, error: "Couldn't delete that." }

  revalidatePath("/pipeline", "layout")
  revalidatePath("/subscribers", "layout")
  return { ok: true as const }
}
