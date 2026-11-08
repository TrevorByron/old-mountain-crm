import { notFound } from "next/navigation"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import {
  PLAN_COLUMNS,
  describeActivity,
  personName,
  sortTimeline,
  todayIso,
  type ActivityRow,
  type PlanRow,
} from "@/lib/pipeline/display"

import { PlanEditor } from "./plan-editor"

export const metadata = { title: "Trip plan" }

const PAGE_SIZE = 1000

export default async function TripPlanPage({ params }: PageProps<"/pipeline/[id]">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const { supabase } = await requireTeamMember()

  const { data, error } = await supabase.from("trip_plans").select(PLAN_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) notFound()
  const plan = data as unknown as PlanRow

  const [trips, activity] = await Promise.all([
    supabase.from("trips").select("id, name, archived, price_per_person, deposit_per_person").order("starts_on"),
    supabase
      .from("activities")
      .select("id, kind, body, meta, author, occurred_at")
      .eq("trip_plan_id", id)
      .order("occurred_at", { ascending: false }),
  ])
  if (trips.error) throw new Error(trips.error.message)
  if (activity.error) throw new Error(activity.error.message)

  const people: { id: string; first_name: string | null; last_name: string | null; email: string | null }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: pageError } = await supabase
      .from("subscribers")
      .select("id, first_name, last_name, email")
      .order("first_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    people.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  const timeline = sortTimeline(
    (activity.data as ActivityRow[]).map((row) => ({
      id: row.id,
      when: row.occurred_at,
      author: row.author,
      deletable: ["note", "call", "email", "meeting"].includes(row.kind),
      ...describeActivity(row),
    }))
  )

  const onPlan = new Set(plan.trip_plan_travelers.map((traveler) => traveler.subscribers.id))

  return (
    <PlanEditor
      key={plan.id}
      plan={plan}
      trips={trips.data.filter((trip) => !trip.archived || trip.id === plan.trip_id).map((trip) => ({ value: trip.id, label: trip.name, price: trip.price_per_person, deposit: trip.deposit_per_person }))}
      people={people
        .filter((person) => !onPlan.has(person.id))
        .map((person) => ({
          value: person.id,
          label: person.email && personName(person) !== person.email ? `${personName(person)} (${person.email})` : personName(person),
        }))}
      timeline={timeline}
      today={todayIso()}
    />
  )
}
