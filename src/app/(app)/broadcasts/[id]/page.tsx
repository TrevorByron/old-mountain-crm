import { notFound } from "next/navigation"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { sendBlockers } from "@/lib/broadcasts/compose"
import { audienceFilterSchema } from "@/lib/broadcasts/content"

import { BroadcastEditor } from "./broadcast-editor"

export const metadata = { title: "Broadcast" }

const PAGE_SIZE = 1000

export default async function BroadcastPage({ params }: PageProps<"/broadcasts/[id]">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const { supabase } = await requireTeamMember()

  const { data: broadcast, error } = await supabase
    .from("broadcasts")
    .select(
      "id, name, template_id, subject, preheader, kicker, heading, body_markdown, cta_label, cta_url, image_url, image_alt, audience_filter, state, scheduled_at, sent_at, last_error"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!broadcast) notFound()

  const [templates, statuses, segments, total, sent] = await Promise.all([
    supabase.from("templates").select("id, name, layout_key").order("created_at").order("name"),
    supabase.from("statuses").select("value").order("position"),
    supabase.from("segments").select("id, name").order("name"),
    supabase.from("sends").select("id", { count: "exact", head: true }).eq("broadcast_id", id),
    supabase.from("sends").select("id", { count: "exact", head: true }).eq("broadcast_id", id).not("sent_at", "is", null),
  ])
  for (const result of [templates, statuses, segments, total, sent]) {
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

  return (
    <BroadcastEditor
      key={id}
      broadcast={{ ...broadcast, audience_filter: audienceFilterSchema.parse(broadcast.audience_filter) }}
      templates={templates.data ?? []}
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
