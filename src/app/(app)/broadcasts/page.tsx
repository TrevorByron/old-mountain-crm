import { SendIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { requireTeamMember } from "@/lib/auth"
import { emailContentSchema } from "@/lib/broadcasts/blocks"
import { previewHtml } from "@/lib/broadcasts/compose"
import { starterContent } from "@/lib/broadcasts/content"
import { rate } from "@/lib/broadcasts/results"

import { EmailsBrowser, type EmailItem } from "./emails-browser"
import { NewBroadcastDialog } from "./new-broadcast-dialog"

export const metadata = { title: "Emails" }

export default async function BroadcastsPage() {
  const { supabase } = await requireTeamMember()

  const { data: broadcasts, error } = await supabase
    .from("broadcasts")
    .select("id, name, subject, preheader, content, state, scheduled_at, sent_at, updated_at, templates (layout_key), sends (count)")
    .order("updated_at", { ascending: false })
  if (error) throw new Error(error.message)

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name, layout_key")
    .order("name")
  if (templatesError) throw new Error(templatesError.message)

  const { data: engagement, error: engagementError } = await supabase.rpc("campaign_engagement")
  if (engagementError) throw new Error(engagementError.message)
  const engagementById = new Map(
    (engagement as { broadcast_id: string; delivered: number; opened: number; clicked: number }[]).map((row) => [row.broadcast_id, row])
  )

  const items: EmailItem[] = await Promise.all(
    broadcasts.map(async (broadcast) => {
      // Drafts started before blocks existed have no content yet, so they show their template.
      const template = broadcast.templates as unknown as { layout_key: string } | null
      const content = broadcast.content ? emailContentSchema.parse(broadcast.content) : starterContent(template?.layout_key ?? "letter")
      const recipients = broadcast.sends[0]?.count ?? 0
      const stats = engagementById.get(broadcast.id)
      const percent = (count: number) => {
        const value = rate(count, stats?.delivered ?? 0, recipients)
        return stats && value !== null ? `${value}%` : null
      }
      return {
        id: broadcast.id,
        name: broadcast.name,
        subject: broadcast.subject,
        state: broadcast.state,
        sentAt: broadcast.sent_at,
        scheduledAt: broadcast.scheduled_at,
        updatedAt: broadcast.updated_at,
        recipients,
        opened: percent(stats?.opened ?? 0),
        clicked: percent(stats?.clicked ?? 0),
        html: await previewHtml(content, broadcast.preheader, process.env, { editing: false }),
      }
    })
  )

  return (
    <>
      <PageHeader title="Emails" description="Newsletters and announcements to the segments you choose.">
        <NewBroadcastDialog templates={templates} />
      </PageHeader>
      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SendIcon />
            </EmptyMedia>
            <EmptyTitle>No emails yet</EmptyTitle>
            <EmptyDescription>Start from a template, write your email and send yourself a test.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewBroadcastDialog templates={templates} />
          </EmptyContent>
        </Empty>
      ) : (
        <EmailsBrowser items={items} />
      )}
    </>
  )
}
