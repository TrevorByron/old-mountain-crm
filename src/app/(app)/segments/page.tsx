import { ListFilterIcon } from "lucide-react"

import { AudienceHeader } from "@/components/audience-header"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { requireTeamMember } from "@/lib/auth"
import { LIFECYCLES, STAGES } from "@/lib/pipeline/stages"
import { describeRules, segmentRulesSchema } from "@/lib/segments/rules"

import { NewSegmentDialog } from "./new-segment-dialog"
import { SegmentsBrowser, type SegmentItem } from "./segments-browser"

export const metadata = { title: "Segments" }

export default async function SegmentsPage() {
  const { supabase } = await requireTeamMember()

  const { data: segments, error } = await supabase
    .from("segments")
    .select("id, name, description, rules, color, updated_at")
    .order("name")
  if (error) throw new Error(error.message)

  const { data: trips, error: tripsError } = await supabase.from("trips").select("id, name")
  if (tripsError) throw new Error(tripsError.message)
  const names = Object.fromEntries([
    ...trips.map((trip) => [trip.id, trip.name]),
    ...STAGES.map((stage) => [stage.key, stage.label]),
    ...LIFECYCLES.map((item) => [item.key, item.label]),
  ])

  const rows = await Promise.all(
    segments.map(async (segment) => {
      const { count, error: countError } = await supabase
        .rpc("segment_subscribers", { target: segment.id }, { count: "exact" })
        .select("id")
        .limit(1)
      if (countError) throw new Error(countError.message)
      return {
        id: segment.id,
        name: segment.name,
        description: segment.description,
        rules: segment.rules,
        color: segment.color,
        updatedAt: segment.updated_at,
        people: count ?? 0,
        rulesText: describeRules(segmentRulesSchema.parse(segment.rules), names),
      } satisfies SegmentItem
    })
  )

  return (
    <>
      <AudienceHeader active="segments" description="Groups you can email. They update on their own.">
        <NewSegmentDialog />
      </AudienceHeader>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListFilterIcon />
            </EmptyMedia>
            <EmptyTitle>No segments yet</EmptyTitle>
            <EmptyDescription>
              Create one for a group you&apos;ll email more than once, like everyone interested in a 2027 safari.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewSegmentDialog />
          </EmptyContent>
        </Empty>
      ) : (
        <SegmentsBrowser items={rows} />
      )}
    </>
  )
}
