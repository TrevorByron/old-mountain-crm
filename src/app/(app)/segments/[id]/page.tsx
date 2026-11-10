import { notFound } from "next/navigation"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { LIFECYCLES, STAGES } from "@/lib/pipeline/stages"
import { RULE_COLUMNS, ruleOptions, segmentRulesSchema } from "@/lib/segments/rules"
import { loadPeople } from "@/lib/people/load"

import { SegmentEditor } from "./segment-editor"

export const metadata = { title: "Segment" }

const PAGE_SIZE = 1000

export default async function SegmentPage({ params }: PageProps<"/segments/[id]">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const { supabase } = await requireTeamMember()

  const { data: segment, error } = await supabase
    .from("segments")
    .select("id, name, description, rules, color")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!segment) notFound()

  const everyone: (Record<string, unknown> & { id: string; first_name: string | null; last_name: string | null; email: string | null })[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await supabase
      .from("subscribers")
      .select(`id, first_name, last_name, email, ${RULE_COLUMNS}`)
      .order("email")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    everyone.push(...(data as unknown as typeof everyone))
    if (data.length < PAGE_SIZE) break
  }

  const members: { id: string }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await supabase
      .rpc("segment_subscribers", { target: id })
      .select("id")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    const page = data as unknown as { id: string }[]
    members.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  const memberIds = new Set(members.map((member) => member.id))
  const { people: allPeople, segments } = await loadPeople(supabase)

  const { data: added, error: addedError } = await supabase
    .from("segment_members")
    .select("subscriber_id")
    .eq("segment_id", id)
  if (addedError) throw new Error(addedError.message)

  const { data: statuses, error: statusesError } = await supabase.from("statuses").select("value").order("position")
  if (statusesError) throw new Error(statusesError.message)

  const { data: trips, error: tripsError } = await supabase.from("trips").select("id, name").order("starts_on")
  if (tripsError) throw new Error(tripsError.message)
  const { data: templates, error: templatesError } = await supabase.from("templates").select("id, name, layout_key").order("name")
  if (templatesError) throw new Error(templatesError.message)
  const tripOptions = trips.map((trip) => ({ label: trip.name, value: trip.id }))

  return (
    <SegmentEditor
      templates={templates}
      journeyOptions={{
        lifecycles: LIFECYCLES.map((item) => ({ label: item.label, value: item.key })),
        plan_stages: STAGES.map((stage) => ({ label: stage.label, value: stage.key })),
        trips: tripOptions,
        not_on_trips: tripOptions,
      }}
      key={id}
      id={id}
      name={segment.name}
      description={segment.description}
      color={segment.color}
      rules={segmentRulesSchema.parse(segment.rules)}
      options={ruleOptions(everyone, statuses.map((status) => status.value))}
      people={allPeople.filter((person) => memberIds.has(person.id))}
      segments={segments}
      addedByHand={added.map((row) => row.subscriber_id)}
      everyone={everyone.map((person) => ({
        value: person.id,
        label: [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email || "No name",
      }))}
    />
  )
}
