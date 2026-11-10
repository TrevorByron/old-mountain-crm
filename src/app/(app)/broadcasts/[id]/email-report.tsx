"use client"

import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"
import { toast } from "sonner"

import { GlanceChart, RateRing } from "@/components/report-charts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RECIPIENT_STATUS_LABELS, rate, recipientStatus, summarizeResults, type RecipientStatus, type ResultSend } from "@/lib/broadcasts/results"
import { personName } from "@/lib/pipeline/display"

import { CampaignRowMenu } from "../campaign-row"
import { resumeBroadcast } from "../actions"

const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })

const STATUS_VARIANTS: Partial<Record<RecipientStatus, "success" | "secondary" | "destructive">> = {
  complained: "destructive",
  bounced: "destructive",
  clicked: "success",
  opened: "success",
}
const STATUS_ORDER: RecipientStatus[] = ["complained", "bounced", "unsubscribed", "clicked", "opened", "delivered", "sent"]

function DeliveryGauge({ delivered, sent }: { delivered: number; sent: number }) {
  const value = sent === 0 ? 0 : Math.round((delivered / sent) * 100)
  const config = { value: { label: "Delivered", color: "var(--chart-1)" } } satisfies ChartConfig
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email delivery</CardTitle>
        <CardDescription>
          {delivered === 0 ? "No delivery reports yet." : `${value}% of your emails were delivered: ${delivered} of ${sent}, without bouncing.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <div className="relative h-32 w-64">
          <ChartContainer config={config} className="size-52 sm:size-64">
            <RadialBarChart data={[{ value }]} cy="50%" innerRadius="78%" outerRadius="100%" startAngle={180} endAngle={0}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
              <RadialBar dataKey="value" fill="var(--color-value)" background={{ fill: "var(--muted)" }} cornerRadius={4} isAnimationActive={false} />
            </RadialBarChart>
          </ChartContainer>
          <span className="absolute inset-x-0 bottom-0 text-center font-heading text-3xl font-medium tabular-nums">{value}%</span>
        </div>
      </CardContent>
    </Card>
  )
}

function ProblemTile({ count, label, caption }: { count: number; label: string; caption: string }) {
  return (
    <Card size="sm">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-heading text-3xl font-medium tabular-nums">{count}</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-center text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  )
}

export type ReportEmail = {
  id: string
  name: string
  subject: string | null
  state: string
  sent_at: string | null
  last_error: string | null
}

// What a sent email looks like afterwards: what happened, then exactly what went out. Nothing here edits it.
export function EmailReport({ email, sends, html, totalCount }: { email: ReportEmail; sends: ResultSend[]; html: string; totalCount: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const summary = summarizeResults(sends)
  const openRate = rate(summary.opened, summary.delivered, summary.sent)
  const clickRate = rate(summary.clicked, summary.delivered, summary.sent)
  // Each stage gets its own color, like Flodesk's report.
  const glance = [
    { label: "Sent", value: summary.sent, color: "var(--chart-1)" },
    { label: "Delivered", value: summary.delivered, color: "var(--chart-2)" },
    { label: "Opened", value: summary.opened, color: "var(--chart-3)" },
    { label: "Clicked", value: summary.clicked, color: "var(--chart-4)" },
  ]
  const recipients = sends
    .filter((send) => send.sent_at)
    .map((send) => ({ send, status: recipientStatus(send) }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
  const plural = (count: number, word: string) => `${count} ${count === 1 ? word : word === "person" ? "people" : `${word}s`}`

  function resume() {
    startTransition(async () => {
      const result = await resumeBroadcast(email.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast.success("Sending resumed")
        router.refresh()
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to emails" render={<Link href="/broadcasts" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-xl font-semibold">{email.name}</h1>
          {email.subject && <p className="truncate text-sm text-muted-foreground">{email.subject}</p>}
        </div>
        <CampaignRowMenu id={email.id} name={email.name} isDraft={false} />
      </div>

      {email.state === "sending" && (
        <Alert>
          <AlertTitle>Sending</AlertTitle>
          <AlertDescription>
            {summary.sent} of {totalCount} sent so far. Refresh to update.
          </AlertDescription>
        </Alert>
      )}
      {email.state === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>
            Stopped after {summary.sent} of {totalCount}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            {email.last_error}
            <Button variant="outline" size="sm" onClick={resume} disabled={isPending}>
              Resume sending
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>At a glance</CardTitle>
            <CardDescription>
              {email.sent_at ? `Sent to ${plural(summary.sent, "person")} on ${longDate.format(new Date(email.sent_at))}.` : `Sent to ${plural(summary.sent, "person")} so far.`}{" "}
              Results count from when tracking was turned on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GlanceChart data={glance} />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <RateRing
            title="Open rate"
            value={openRate}
            color="var(--chart-1)"
            caption={summary.opened === 0 ? "No one has opened it yet. Opens are an estimate: some inboxes load images on their own." : `${plural(summary.opened, "person")} opened it. Opens are an estimate.`}
          />
          <RateRing
            title="Click rate"
            value={clickRate}
            color="var(--chart-2)"
            caption={summary.clicked === 0 ? "No one has clicked a link yet." : `${plural(summary.clicked, "person")} clicked a link.`}
          />
        </div>

        <DeliveryGauge delivered={summary.delivered} sent={summary.sent} />

        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-base font-medium">Bounces, unsubscribes and spam</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <ProblemTile
              count={summary.bounced}
              label="Bounced"
              caption={summary.bounced === 0 ? "Every email reached an inbox." : "Permanent bounces are stopped from getting more email."}
            />
            <ProblemTile
              count={summary.unsubscribed}
              label="Unsubscribed"
              caption={summary.unsubscribed === 0 ? "No one left your list." : "They won't get marketing email again."}
            />
            <ProblemTile
              count={summary.complained}
              label="Marked as spam"
              caption={summary.complained === 0 ? "No one marked it as spam." : "They're stopped from getting more email."}
            />
          </div>
        </div>

        {summary.links.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Links clicked</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Link</TableHead>
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
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Who it went to</CardTitle>
            <CardDescription>{plural(recipients.length, "person")}, with the furthest each one got.</CardDescription>
          </CardHeader>
          <CardContent>
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                Show everyone
                <ChevronDownIcon data-icon="inline-end" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableBody>
                    {recipients.map(({ send, status }) => (
                      <TableRow key={send.id}>
                        <TableCell className="max-w-0 truncate font-medium">
                          {send.subscribers ? (
                            <Link href={`/subscribers/${send.subscribers.id}`} className="underline-offset-4 hover:underline">
                              {send.subscribers.email ?? personName(send.subscribers)}
                            </Link>
                          ) : (
                            "Removed person"
                          )}
                        </TableCell>
                        <TableCell className="w-28 text-right sm:w-40">
                          <Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>{RECIPIENT_STATUS_LABELS[status]}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What was sent</CardTitle>
            <CardDescription>Exactly as it went out. Duplicate it from ⋯ to send something similar.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <iframe
              title={`What was sent in ${email.name}`}
              srcDoc={html}
              sandbox="allow-same-origin"
              className="h-[32rem] w-full max-w-[640px] rounded-lg border bg-white sm:h-[48rem]"
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
