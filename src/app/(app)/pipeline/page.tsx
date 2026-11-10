import { PageHeader } from "@/components/page-header"
import { requireTeamMember } from "@/lib/auth"
import { PLAN_COLUMNS, personName, todayIso, type PlanRow } from "@/lib/pipeline/display"

import { NewPlanDialog } from "./new-plan-dialog"
import { PipelineBoard } from "./pipeline-board"

export const metadata = { title: "Pipeline" }

const PAGE_SIZE = 1000

export default async function PipelinePage() {
  const { supabase } = await requireTeamMember()

  const { data: planRows, error } = await supabase
    .from("trip_plans")
    .select(PLAN_COLUMNS)
    .order("updated_at", { ascending: false })
  if (error) throw new Error(error.message)

  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("id, name")
    .eq("archived", false)
    .order("starts_on")
  if (tripsError) throw new Error(tripsError.message)

  const people: { id: string; first_name: string | null; last_name: string | null; email: string | null }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await supabase
      .from("subscribers")
      .select("id, first_name, last_name, email")
      .order("first_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    people.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  const peopleOptions = people.map((person) => ({
    value: person.id,
    label: person.email && personName(person) !== person.email ? `${personName(person)} (${person.email})` : personName(person),
  }))
  const tripOptions = trips.map((trip) => ({ value: trip.id as string, label: trip.name as string }))

  return (
    <>
      <PageHeader title="Pipeline" description="Everyone you're talking to seriously. Drag a card to move it along." fab={<NewPlanDialog people={peopleOptions} trips={tripOptions} fab />}>
        <NewPlanDialog people={peopleOptions} trips={tripOptions} />
      </PageHeader>
      <PipelineBoard plans={planRows as unknown as PlanRow[]} trips={tripOptions} today={todayIso()} />
    </>
  )
}
