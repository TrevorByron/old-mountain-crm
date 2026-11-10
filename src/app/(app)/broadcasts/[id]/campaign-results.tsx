import { ChevronDownIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RECIPIENT_STATUS_LABELS, rate, recipientStatus, summarizeResults, type RecipientStatus, type ResultSend } from "@/lib/broadcasts/results"
import { personName } from "@/lib/pipeline/display"

const STATUS_VARIANTS: Partial<Record<RecipientStatus, "default" | "secondary" | "destructive" | "outline">> = {
  complained: "destructive",
  bounced: "destructive",
  clicked: "default",
  opened: "secondary",
}

const STATUS_ORDER: RecipientStatus[] = ["complained", "bounced", "unsubscribed", "clicked", "opened", "delivered", "sent"]

export function CampaignResults({ sends }: { sends: ResultSend[] }) {
  const summary = summarizeResults(sends)
  const percent = (count: number) => {
    const value = rate(count, summary.delivered, summary.sent)
    return value === null ? "" : `${value}%`
  }
  const stats = [
    { label: "Sent", value: String(summary.sent), note: "" },
    { label: "Delivered", value: String(summary.delivered), note: "" },
    { label: "Opened", value: String(summary.opened), note: percent(summary.opened) },
    { label: "Clicked", value: String(summary.clicked), note: percent(summary.clicked) },
    { label: "Bounced", value: String(summary.bounced), note: "" },
    { label: "Unsubscribed", value: String(summary.unsubscribed), note: "" },
    { label: "Marked as spam", value: String(summary.complained), note: "" },
  ]
  const recipients = sends
    .filter((send) => send.sent_at)
    .map((send) => ({ send, status: recipientStatus(send) }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>
          Opens are an estimate: some inboxes load images on their own, and others block them. Clicks are more reliable. Results count from when tracking was turned on.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-sm text-muted-foreground">{stat.label}</dt>
              <dd className="font-heading text-xl font-medium tabular-nums">
                {stat.value}
                {stat.note && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{stat.note}</span>}
              </dd>
            </div>
          ))}
        </dl>

        {summary.links.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Links clicked</TableHead>
                <TableHead className="text-right">People</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.links.map((link) => (
                <TableRow key={link.url}>
                  <TableCell className="max-w-0 truncate">
                    <a href={link.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                      {link.url}
                    </a>
                  </TableCell>
                  <TableCell className="w-20 text-right tabular-nums">{link.people}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ml-2" />}>
            Everyone it went to ({recipients.length})
            <ChevronDownIcon data-icon="inline-end" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Table>
              <TableBody>
                {recipients.map(({ send, status }) => (
                  <TableRow key={send.id}>
                    <TableCell className="font-medium">
                      {send.subscribers ? (
                        <Link href={`/subscribers/${send.subscribers.id}`} className="underline-offset-4 hover:underline">
                          {personName(send.subscribers)}
                        </Link>
                      ) : (
                        "Removed person"
                      )}
                    </TableCell>
                    <TableCell className="w-40 text-right">
                      <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>{RECIPIENT_STATUS_LABELS[status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
