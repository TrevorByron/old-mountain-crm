import type { SupabaseClient } from "@supabase/supabase-js"

import { followUpState, lastContactLabel, needsStayingInTouch } from "@/lib/people/profile"

import { PLAN_COLUMNS, formatDate, personName, planTitle, todayIso, type PlanRow } from "./display"
import { isOpenStage, planAttention, summarizePayments, type AttentionReason } from "./stages"

const PAGE_SIZE = 1000

// Airtable's signs that someone was already further along than the list suggests.
const REVIEW_SEGMENTS = ["Past Clients", "Committed Clients"]
const REVIEW_STATUSES = ["Pre-payment", "Paid"]

export type AttentionItem = {
  key: string
  href: string
  name: string
  message: string
  urgency: "overdue" | "today" | "soon" | "other"
  reminderFor?: string
}

export type ReviewPerson = { id: string; name: string; reasons: string[] }

type PersonRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  segments: string[]
  status: string | null
  follow_up_on: string | null
  follow_up_note: string | null
}

const URGENCY_ORDER = { overdue: 0, today: 1, soon: 2, other: 3 }

function urgencyOf(reason: AttentionReason): AttentionItem["urgency"] {
  if (reason.severity === "overdue") return "overdue"
  if (reason.message.startsWith("Due today")) return "today"
  return reason.severity === "soon" ? "soon" : "other"
}

// Everything waiting on the team, most urgent first. Today and the nav badge both read this,
// so they can't disagree.
export async function loadAttention(supabase: SupabaseClient) {
  const today = todayIso()

  const { data: planRows, error } = await supabase.from("trip_plans").select(PLAN_COLUMNS)
  if (error) throw new Error(error.message)
  const plans = planRows as unknown as PlanRow[]

  const people: PersonRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await supabase
      .from("subscribers")
      .select("id, first_name, last_name, email, segments, status, follow_up_on, follow_up_note")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    people.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  const { data: pastGuests, error: guestsError } = await supabase
    .from("contact_lifecycle")
    .select("subscriber_id")
    .eq("lifecycle", "past_guest")
  if (guestsError) throw new Error(guestsError.message)
  const pastGuestIds = new Set(pastGuests.map((row) => row.subscriber_id as string))

  const { data: touches, error: touchesError } = await supabase
    .from("contact_last_touch")
    .select("subscriber_id, last_touch")
    .in("subscriber_id", [...pastGuestIds])
  if (touchesError) throw new Error(touchesError.message)
  const lastTouch = new Map(touches.map((row) => [row.subscriber_id as string, row.last_touch as string]))

  const items: AttentionItem[] = plans.flatMap((plan) =>
    planAttention({ ...plan, trip: plan.trips }, today).map((reason) => ({
      key: `${plan.id}-${reason.message}`,
      href: `/pipeline/${plan.id}`,
      name: planTitle(plan),
      message: reason.message,
      urgency: urgencyOf(reason),
    }))
  )

  for (const person of people) {
    const state = followUpState(person.follow_up_on, today)
    if (state === "overdue" || state === "today") {
      items.push({
        key: `follow-up-${person.id}`,
        href: `/subscribers/${person.id}`,
        name: personName(person),
        message: `${state === "overdue" ? `Was due ${formatDate(person.follow_up_on)}` : "Due today"}: ${person.follow_up_note ?? "Get back in touch"}`,
        urgency: state,
        reminderFor: person.id,
      })
      continue
    }
    const touched = lastTouch.get(person.id) ?? null
    const lifecycle = pastGuestIds.has(person.id) ? "past_guest" : "other"
    if (needsStayingInTouch({ lifecycle, follow_up_on: person.follow_up_on, last_touch: touched }, today)) {
      items.push({
        key: `stay-in-touch-${person.id}`,
        href: `/subscribers/${person.id}`,
        name: personName(person),
        message: `Past guest. Last contact: ${lastContactLabel(touched, today).toLowerCase()}`,
        urgency: "other",
      })
    }
  }
  items.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency])

  const onAPlan = new Set(plans.flatMap((plan) => plan.trip_plan_travelers.map((traveler) => traveler.subscribers.id)))
  const review: ReviewPerson[] = people.flatMap((person) => {
    if (onAPlan.has(person.id)) return []
    const reasons = [
      ...person.segments.filter((segment) => REVIEW_SEGMENTS.includes(segment)),
      ...(person.status && REVIEW_STATUSES.includes(person.status) ? [`Status: ${person.status}`] : []),
    ]
    return reasons.length > 0 ? [{ id: person.id, name: personName(person), reasons }] : []
  })

  const openPlans = plans.filter((plan) => isOpenStage(plan.stage))
  const balanceDue = openPlans.reduce((sum, plan) => {
    const { balance } = summarizePayments(plan, plan.payments, today)
    return sum + Math.max(0, balance ?? 0)
  }, 0)

  return { items, review, people, plans, openPlanCount: openPlans.length, balanceDue, count: items.length + review.length, today }
}
