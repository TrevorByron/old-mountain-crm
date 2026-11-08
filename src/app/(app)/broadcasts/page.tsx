import Link from "next/link"
import { SendIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"

import { CampaignRowMenu } from "./campaign-row"
import { NewBroadcastDialog } from "./new-broadcast-dialog"

export const metadata = { title: "Campaigns" }

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })

const STATE_BADGES: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  draft: { label: "Draft", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  sending: { label: "Sending", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  failed: { label: "Stopped", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
}

export default async function BroadcastsPage() {
  const { supabase } = await requireTeamMember()

  const { data: broadcasts, error } = await supabase
    .from("broadcasts")
    .select("id, name, subject, state, scheduled_at, sent_at, updated_at, sends (count)")
    .order("updated_at", { ascending: false })
  if (error) throw new Error(error.message)

  const { data: templates, error: templatesError } = await supabase
    .from("templates")
    .select("id, name, layout_key")
    .order("name")
  if (templatesError) throw new Error(templatesError.message)

  return (
    <>
      <PageHeader title="Campaigns" description="Emails to the segments you choose.">
        <NewBroadcastDialog templates={templates} />
      </PageHeader>
      {broadcasts.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SendIcon />
            </EmptyMedia>
            <EmptyTitle>No campaigns yet</EmptyTitle>
            <EmptyDescription>Start from a template, write your email and send yourself a test.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewBroadcastDialog templates={templates} />
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="hidden md:table-cell">When (Eastern)</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((broadcast) => {
                  const badge = STATE_BADGES[broadcast.state] ?? STATE_BADGES.draft
                  const when = broadcast.sent_at ?? broadcast.scheduled_at
                  return (
                    <TableRow key={broadcast.id} className="relative">
                      <TableCell className="whitespace-normal">
                        <Link href={`/broadcasts/${broadcast.id}`} className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline">
                          {broadcast.name}
                        </Link>
                        {broadcast.subject && <p className="text-muted-foreground">{broadcast.subject}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{when ? dateFormat.format(new Date(when)) : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{broadcast.sends[0]?.count ?? 0}</TableCell>
                      <TableCell className="w-10 text-right">
                        <CampaignRowMenu id={broadcast.id} name={broadcast.name} isDraft={broadcast.state === "draft"} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
