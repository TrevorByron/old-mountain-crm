import { notFound } from "next/navigation"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { RULE_COLUMNS, ruleOptions, segmentRulesSchema } from "@/lib/segments/rules"

import { SegmentEditor, type SegmentPerson } from "./segment-editor"

export const metadata = { title: "Segment" }

const PAGE_SIZE = 1000

export default async function SegmentPage({ params }: PageProps<"/segments/[id]">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const { supabase } = await requireTeamMember()

  const { data: segment, error } = await supabase
    .from("segments")
    .select("id, name, description, rules")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!segment) notFound()

  const everyone: (Record<string, unknown> & { id: string; first_name: string | null; last_name: string | null; email: string })[] = []
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

  const people: SegmentPerson[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await supabase
      .rpc("segment_subscribers", { target: id })
      .select("id, first_name, last_name, email, status, interests, departure_window, unsubscribed_at, suppressed")
      .order("email")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    const page = data as unknown as SegmentPerson[]
    people.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  const { data: added, error: addedError } = await supabase
    .from("segment_members")
    .select("subscriber_id")
    .eq("segment_id", id)
  if (addedError) throw new Error(addedError.message)

  const { data: statuses, error: statusesError } = await supabase.from("statuses").select("value").order("position")
  if (statusesError) throw new Error(statusesError.message)

  return (
    <SegmentEditor
      key={id}
      id={id}
      name={segment.name}
      description={segment.description}
      rules={segmentRulesSchema.parse(segment.rules)}
      options={ruleOptions(everyone, statuses.map((status) => status.value))}
      people={people}
      addedByHand={added.map((row) => row.subscriber_id)}
      everyone={everyone.map((person) => ({
        value: person.id,
        label: [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email,
      }))}
    />
  )
}
