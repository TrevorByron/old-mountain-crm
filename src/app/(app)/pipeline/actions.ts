"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { personName, type PersonName } from "@/lib/pipeline/display"
import { EARLY_STAGES, ITINERARY_KEYS, PAYMENT_KIND_KEYS, PREP_ITEMS, STAGE_KEYS, isEarlyStage } from "@/lib/pipeline/stages"

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

const newTripSchema = z
  .object({ name: z.string().trim().min(1, "Name the trip.").max(200), starts_on: dateSchema.nullable() })
  .nullable()
  .optional()

const createSchema = z.object({
  subscriberId: z.uuid("Choose who this trip plan is for."),
  tripId: idSchema.nullable(),
  newTrip: newTripSchema,
  stage: z.enum(STAGE_KEYS).default("talking"),
  owner: nullableText(80).optional(),
})

type Supabase = Awaited<ReturnType<typeof requireTeamMember>>["supabase"]

// A custom safari is often its own trip, including past ones being logged after the fact.
async function resolveTrip(
  supabase: Supabase,
  tripId: string | null,
  newTrip: z.infer<typeof newTripSchema>
): Promise<{ error: string } | { tripId: string | null; terms: { agreed_total?: number | null; deposit_amount?: number | null; balance_due_on?: string | null } }> {
  let id = tripId
  if (newTrip) {
    const { data: created, error } = await supabase
      .from("trips")
      .insert({ name: newTrip.name, kind: "custom", starts_on: newTrip.starts_on })
      .select("id")
      .single()
    if (error) return { error: "Couldn't create the trip." }
    id = created.id as string
  }
  if (!id) return { tripId: null, terms: {} }

  const { data: trip, error } = await supabase
    .from("trips")
    .select("price_per_person, deposit_per_person, balance_due_on")
    .eq("id", id)
    .single()
  if (error) return { error: "Couldn't find that trip." }
  return {
    tripId: id,
    terms: { agreed_total: trip.price_per_person, deposit_amount: trip.deposit_per_person, balance_due_on: trip.balance_due_on },
  }
}

// A trip is one departure, so nobody can be on it twice. A plan closed as "not this time"
// doesn't count, because that's them not going.
async function tripConflict(supabase: Supabase, subscriberIds: string[], tripId: string, ignorePlanId?: string) {
  if (subscriberIds.length === 0) return null
  const { data, error } = await supabase
    .from("trip_plan_travelers")
    .select("trip_plan_id, subscribers (first_name, last_name, email), trip_plans!inner (trip_id, stage, trips (name))")
    .in("subscriber_id", subscriberIds)
    .eq("trip_plans.trip_id", tripId)
  if (error) return { planId: null, message: "Couldn't check who's already on that trip." }

  const rows = data as unknown as {
    trip_plan_id: string
    subscribers: PersonName
    trip_plans: { stage: string; trips: { name: string } | null }
  }[]
  const clash = rows.find((row) => row.trip_plan_id !== ignorePlanId && row.trip_plans.stage !== "not_this_time")
  if (!clash) return null
  return {
    planId: clash.trip_plan_id,
    message: `${personName(clash.subscribers)} is already on ${clash.trip_plans.trips?.name ?? "that trip"}.`,
  }
}

async function planTravelerIds(supabase: Supabase, planId: string) {
  const { data } = await supabase.from("trip_plan_travelers").select("subscriber_id").eq("trip_plan_id", planId)
  return (data ?? []).map((row) => row.subscriber_id as string)
}

// Fills in the trip's price and terms as a starting point. They're this plan's own from
// then on, because a couple or a custom deal can differ.
export async function createPlan(input: unknown) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { subscriberId, newTrip, stage, owner } = parsed.data

  const resolved = await resolveTrip(supabase, parsed.data.tripId, newTrip)
  if ("error" in resolved) return { ok: false as const, error: resolved.error }
  const { tripId, terms } = resolved

  if (tripId && !newTrip) {
    const clash = await tripConflict(supabase, [subscriberId], tripId)
    if (clash) return { ok: false as const, error: clash.message, existingId: clash.planId }
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

  if (fields.trip_id || fields.stage) {
    const { data: plan, error: readError } = await supabase.from("trip_plans").select("trip_id, stage").eq("id", id).single()
    if (readError) return { ok: false as const, error: "Couldn't save that change." }
    const changingTrip = Boolean(fields.trip_id) && fields.trip_id !== plan.trip_id
    const reopening = plan.stage === "not_this_time" && Boolean(fields.stage) && fields.stage !== "not_this_time"
    const tripId = fields.trip_id ?? plan.trip_id
    if (tripId && (changingTrip || reopening)) {
      const clash = await tripConflict(supabase, await planTravelerIds(supabase, id), tripId, id)
      if (clash) return { ok: false as const, error: clash.message }
    }
  }

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

// Back to the start of the journey, as if the plan had just been created for this trip.
export async function resetPlan(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't reset the trip plan." }

  const { supabase, member } = await requireTeamMember()
  const { data: plan, error: readError } = await supabase
    .from("trip_plans")
    .select("trips (price_per_person, deposit_per_person, balance_due_on)")
    .eq("id", id)
    .single()
  if (readError) return { ok: false as const, error: "Couldn't reset the trip plan." }
  const trip = plan.trips as unknown as { price_per_person: number | null; deposit_per_person: number | null; balance_due_on: string | null } | null

  await supabase.from("payments").update({ recorded_by: member.email }).eq("trip_plan_id", id)
  const { error: paymentsError } = await supabase.from("payments").delete().eq("trip_plan_id", id)
  if (paymentsError) return { ok: false as const, error: "Couldn't clear the payments." }

  const { error } = await supabase
    .from("trip_plans")
    .update({
      stage: "talking",
      next_step: null,
      next_step_due: null,
      itinerary_status: "not_started",
      itinerary_url: null,
      closed_reason: null,
      prep_done: [],
      agreed_total: trip?.price_per_person ?? null,
      deposit_amount: trip?.deposit_per_person ?? null,
      deposit_due_on: null,
      balance_due_on: trip?.balance_due_on ?? null,
      last_changed_by: member.email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't reset the trip plan." }

  refresh(id)
  return { ok: true as const }
}

const travelerSchema = z.object({ planId: idSchema, subscriberId: idSchema })

// Takes one person off a trip. If they were the only traveler, the plan goes with them.
export async function removeFromTrip(input: unknown) {
  const parsed = travelerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't remove them." }

  const { supabase } = await requireTeamMember()
  const { count, error } = await supabase
    .from("trip_plan_travelers")
    .select("subscriber_id", { count: "exact", head: true })
    .eq("trip_plan_id", parsed.data.planId)
  if (error) return { ok: false as const, error: "Couldn't remove them." }
  return (count ?? 0) <= 1 ? deletePlan(parsed.data.planId) : removeTraveler(parsed.data)
}

export async function addTraveler(input: unknown) {
  const parsed = travelerSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Choose someone to add." }

  const { supabase } = await requireTeamMember()
  const { data: plan } = await supabase.from("trip_plans").select("trip_id, stage").eq("id", parsed.data.planId).single()
  if (plan?.trip_id && plan.stage !== "not_this_time") {
    const clash = await tripConflict(supabase, [parsed.data.subscriberId], plan.trip_id, parsed.data.planId)
    if (clash) return { ok: false as const, error: clash.message }
  }

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

  // A deposit means they've said yes, so the plan shouldn't still read as talking.
  let moved = false
  if (fields.kind === "deposit") {
    const { data: updated, error: stageError } = await supabase
      .from("trip_plans")
      .update({ stage: "committed", last_changed_by: member.email, updated_at: new Date().toISOString() })
      .eq("id", planId)
      .in("stage", EARLY_STAGES)
      .select("id")
    if (stageError) return { ok: false as const, error: STAGE_NOT_MOVED }
    moved = updated.length > 0
  }

  refresh(planId)
  return { ok: true as const, moved }
}

const depositSchema = z
  .object({
    subscriberId: idSchema.nullable(),
    planId: idSchema.nullable(),
    tripId: idSchema.nullable(),
    newTrip: newTripSchema,
    owner: nullableText(80).optional(),
    amount: z.number().positive("Enter the deposit amount.").max(100_000_000),
    total: nullableMoney,
    paid_on: dateSchema,
    method: nullableText(80),
  })
  .refine((value) => value.planId || value.subscriberId, "Couldn't tell who this deposit is for.")

const STAGE_NOT_MOVED = "The payment saved, but the stage didn't change. Don't record it again, just move the stage by hand."

// The shortcut from anywhere in the journey to "they've paid a deposit": starts a trip plan if
// they don't have one yet, logs the money and moves them to Committed.
export async function recordDeposit(input: unknown) {
  const parsed = depositSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { subscriberId, tripId, newTrip, owner, amount, total, paid_on, method } = parsed.data
  const isNewPlan = !parsed.data.planId
  let planId = parsed.data.planId
  let terms: { agreed_total?: number | null; deposit_amount?: number | null; balance_due_on?: string | null } = {}
  let chosenTrip: string | null = null

  if (!planId) {
    const created = await createPlan({ subscriberId, tripId, newTrip, stage: "committed", owner })
    if (!created.ok) return created
    planId = created.id
  } else if (tripId || newTrip) {
    const resolved = await resolveTrip(supabase, tripId, newTrip)
    if ("error" in resolved) return { ok: false as const, error: resolved.error }
    chosenTrip = resolved.tripId
    terms = resolved.terms
    if (chosenTrip && !newTrip) {
      const clash = await tripConflict(supabase, await planTravelerIds(supabase, planId), chosenTrip, planId)
      if (clash) return { ok: false as const, error: clash.message }
    }
  }

  const { data: plan, error: readError } = await supabase
    .from("trip_plans")
    .select("stage, trip_id, agreed_total, deposit_amount, balance_due_on")
    .eq("id", planId)
    .single()
  if (readError) return { ok: false as const, error: "Couldn't find that trip plan." }

  const { error: paymentError } = await supabase
    .from("payments")
    .insert({ trip_plan_id: planId, kind: "deposit", amount, paid_on, method, note: null, recorded_by: member.email })
  if (paymentError) {
    if (isNewPlan) await supabase.from("trip_plans").delete().eq("id", planId)
    return { ok: false as const, error: "Couldn't record the deposit." }
  }

  const moved = isNewPlan || isEarlyStage(plan.stage)
  const { error: updateError } = await supabase
    .from("trip_plans")
    .update({
      ...(isEarlyStage(plan.stage) ? { stage: "committed" } : {}),
      ...(chosenTrip && !plan.trip_id ? { trip_id: chosenTrip, balance_due_on: plan.balance_due_on ?? terms.balance_due_on ?? null } : {}),
      agreed_total: total ?? plan.agreed_total ?? terms.agreed_total ?? null,
      deposit_amount: plan.deposit_amount ?? terms.deposit_amount ?? amount,
      last_changed_by: member.email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
  if (updateError) return { ok: false as const, error: STAGE_NOT_MOVED }

  refresh(planId)
  return { ok: true as const, id: planId, moved }
}

const editPaymentSchema = z.object({
  planId: idSchema,
  id: idSchema,
  kind: z.enum(PAYMENT_KIND_KEYS).optional(),
  amount: z.number().positive("Enter an amount above zero.").max(100_000_000).optional(),
  paid_on: dateSchema.optional(),
  method: nullableText(80).optional(),
})

// Money changes always leave a trace, so a correction shows up in the history.
export async function updatePayment(input: unknown) {
  const parsed = editPaymentSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { id, planId, ...fields } = parsed.data
  const { data, error } = await supabase.from("payments").update(fields).eq("id", id).select("kind, amount").single()
  if (error) return { ok: false as const, error: "Couldn't change the payment." }

  await supabase.from("activities").insert({
    trip_plan_id: planId,
    kind: "payment",
    meta: { action: "edited", kind: data.kind, amount: data.amount },
    author: member.email,
  })

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

const editNoteSchema = z.object({ id: idSchema, body: z.string().trim().min(1, "A note can't be empty. Remove it instead.").max(10_000) })

export async function updateNote(input: unknown) {
  const parsed = editNoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase
    .from("activities")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.id)
    .in("kind", ["note", "call", "email", "meeting"])
  if (error) return { ok: false as const, error: "Couldn't change that note." }

  revalidatePath("/pipeline", "layout")
  revalidatePath("/subscribers", "layout")
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
