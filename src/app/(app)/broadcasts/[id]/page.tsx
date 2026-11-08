import { notFound } from "next/navigation"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { emailContentSchema } from "@/lib/broadcasts/blocks"
import { sendBlockers } from "@/lib/broadcasts/compose"
import { audienceFilterSchema, starterContent } from "@/lib/broadcasts/content"

import { BroadcastEditor } from "./broadcast-editor"

export const metadata = { title: "Campaign" }

const PAGE_SIZE = 1000

export default async function BroadcastPage({ params }: PageProps<"/broadcasts/[id]">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const { supabase } = await requireTeamMember()

  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .select(
      "id, name, subject, preheader, content, audience_filter, state, scheduled_at, sent_at, last_error, templates (layout_key)"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!broadcast) notFound()

  const [statuses, segments, total, sent] = await Promise.all([
    supabase.from("statuses").select("value").order("position"),
    supabase.from("segments").select("id, name").order("name"),
    supabase.from("sends").select("id", { count: "exact", head: true }).eq("broadcast_id", id),
    supabase.from("sends").select("id", { count: "exact", head: true }).eq("broadcast_id", id).not("sent_at", "is", null),
  ])
  for (const result of [statuses, segments, total, sent]) {
    if (result.error) throw new Error(result.error.message)
  }

  const airtableSegments = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await supabase
      .from("subscribers")
      .select("segments")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    data.forEach((row) => row.segments.forEach((segment: string) => airtableSegments.add(segment)))
    if (data.length < PAGE_SIZE) break
  }

  // Drafts started before blocks existed have no content yet, so they begin from their template.
  const template = broadcast.templates as unknown as { layout_key: string } | null
  const content = broadcast.content
    ? emailContentSchema.parse(broadcast.content)
    : starterContent(template?.layout_key ?? "letter")

  return (
    <BroadcastEditor
      key={id}
      broadcast={{ ...broadcast, content, audience_filter: audienceFilterSchema.parse(broadcast.audience_filter) }}
      statuses={(statuses.data ?? []).map((status) => status.value)}
      airtableSegments={[...airtableSegments].sort()}
      segments={segments.data ?? []}
      sentCount={sent.count ?? 0}
      totalCount={total.count ?? 0}
      testBlockers={sendBlockers(process.env, { realRecipients: false })}
      sendBlockers={sendBlockers(process.env, { realRecipients: true })}
    />
  )
}
