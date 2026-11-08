import { ArrowLeftIcon, MailIcon, PhoneIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ActivityTimeline, NoteComposer } from "@/components/activity-timeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { companions, followUpState, journeySummary, lastContactLabel, tripInterestSummary } from "@/lib/people/profile"
import {
  PLAN_COLUMNS,
  describeActivity,
  formatDate,
  personName,
  sortTimeline,
  todayIso,
  type ActivityRow,
  type PlanRow,
  type TimelineEntry,
} from "@/lib/pipeline/display"
import {
  PAYMENT_STATUS_LABELS,
  formatMoney,
  lifecycleLabel,
  stageLabel,
  summarizePayments,
} from "@/lib/pipeline/stages"

import { NewPlanDialog } from "../../pipeline/new-plan-dialog"
import type { Subscriber } from "../subscriber-table"
import { EditPerson } from "./edit-person"
import { AboutCard, FollowUpCard, MarketingToggle } from "./person-panels"

export const metadata = { title: "Person" }

const NOTE_KINDS = ["note", "call", "email", "meeting"]

function emailStatus(person: { email: string | null; suppressed: boolean; suppressed_reason: string | null; unsubscribed_at: string | null; marketing_ok: boolean }) {
  if (!person.email) return "No email"
  if (person.suppressed) return `Suppressed (${person.suppressed_reason?.replace("_", " ")})`
  if (person.unsubscribed_at) return "Unsubscribed"
  return person.marketing_ok ? "On the list" : "Not on the list"
}

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "alert" }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${tone === "alert" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  )
}

function BadgeRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  )
}

export default async function PersonPage({ params }: PageProps<"/subscribers/[id]">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const { supabase } = await requireTeamMember()

  const { data: person, error } = await supabase
    .from("subscribers")
    .select(
      "id, email, first_name, last_name, status, source, country, segments, subscribed_at, unsubscribed_at, suppressed, suppressed_reason, phone, account_owner, trip_type, departure_window, group_size, interests, interests_other, objections, objections_other, about, tags, referred_by, follow_up_on, follow_up_note, marketing_ok, airtable_record_id"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!person) notFound()

  const { data: traveling, error: travelingError } = await supabase
    .from("trip_plan_travelers")
    .select("trip_plan_id")
    .eq("subscriber_id", id)
  if (travelingError) throw new Error(travelingError.message)
  const planIds = traveling.map((row) => row.trip_plan_id as string)

  const [lifecycle, lastTouch, planResult, trips, statuses, savedSegments, ownNotes, planActivity, statusHistory, sends] =
    await Promise.all([
      supabase.from("contact_lifecycle").select("lifecycle").eq("subscriber_id", id).single(),
      supabase.from("contact_last_touch").select("last_touch").eq("subscriber_id", id).maybeSingle(),
      supabase.from("trip_plans").select(PLAN_COLUMNS).in("id", planIds).order("created_at", { ascending: false }),
      supabase.from("trips").select("id, name").eq("archived", false).order("starts_on"),
      supabase.from("statuses").select("value").order("position"),
      supabase.rpc("person_segments", { target: id }).select("id, name"),
      supabase.from("activities").select("id, kind, body, meta, author, occurred_at").eq("subscriber_id", id),
      supabase.from("activities").select("id, kind, body, meta, author, occurred_at, trip_plan_id").in("trip_plan_id", planIds),
      supabase.from("subscriber_status_history").select("id, from_status, to_status, changed_by, changed_at").eq("subscriber_id", id),
      supabase.from("sends").select("id, subject, sent_at, broadcast_id").eq("subscriber_id", id).not("sent_at", "is", null),
    ])
  for (const result of [lifecycle, lastTouch, planResult, trips, statuses, savedSegments, ownNotes, planActivity, statusHistory, sends]) {
    if (result.error) throw new Error(result.error.message)
  }

  const plans = (planResult.data ?? []) as unknown as PlanRow[]
  const today = todayIso()
  const journey = journeySummary(plans, today)
  const lifetime = plans.reduce((sum, plan) => sum + summarizePayments(plan, plan.payments, today).paid, 0)
  const followUp = followUpState(person.follow_up_on, today)
  const travelMates = companions(plans, id)
  const tripSummary = tripInterestSummary(person)

  const timeline: TimelineEntry[] = sortTimeline([
    { id: "signup", when: person.subscribed_at, title: "Joined the list", detail: person.source, author: null },
    ...((ownNotes.data ?? []) as ActivityRow[]).map((row) => ({
      id: row.id,
      when: row.occurred_at,
      author: row.author,
      deletable: NOTE_KINDS.includes(row.kind),
      ...describeActivity(row),
    })),
    ...((planActivity.data ?? []) as (ActivityRow & { trip_plan_id: string })[]).map((row) => ({
      id: row.id,
      when: row.occurred_at,
      author: row.author,
      href: `/pipeline/${row.trip_plan_id}`,
      deletable: NOTE_KINDS.includes(row.kind),
      ...describeActivity(row),
    })),
    ...(statusHistory.data ?? [])
      .filter((row) => row.from_status !== null)
      .map((row) => ({
        id: row.id as string,
        when: row.changed_at as string,
        title: `Status: ${row.from_status} → ${row.to_status ?? "none"}`,
        detail: null,
        author: row.changed_by as string | null,
      })),
    ...(sends.data ?? []).map((row) => ({
      id: row.id as string,
      when: row.sent_at as string,
      title: `Emailed: ${row.subject ?? "broadcast"}`,
      detail: null,
      author: null,
      href: row.broadcast_id ? `/broadcasts/${row.broadcast_id}` : undefined,
    })),
  ])

  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to people" render={<Link href="/subscribers" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-64 flex-1">
          <h1 className="font-heading text-xl font-semibold">{personName(person)}</h1>
          <p className="break-all text-sm text-muted-foreground">{[person.email, person.phone].filter(Boolean).join(" · ") || "No contact details yet"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge>{lifecycleLabel(lifecycle.data?.lifecycle ?? "subscriber")}</Badge>
            {(person.tags as string[]).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {person.email && (
            <Button variant="outline" render={<a href={`mailto:${person.email}`} />} nativeButton={false}>
              <MailIcon data-icon="inline-start" />
              Email
            </Button>
          )}
          {person.phone && (
            <Button variant="outline" render={<a href={`tel:${person.phone}`} />} nativeButton={false}>
              <PhoneIcon data-icon="inline-start" />
              Call
            </Button>
          )}
          <EditPerson person={person as unknown as Subscriber} statuses={(statuses.data ?? []).map((status) => status.value as string)} />
          <NewPlanDialog
            people={[]}
            trips={(trips.data ?? []).map((trip) => ({ value: trip.id as string, label: trip.name as string }))}
            personId={id}
            defaultOwner={person.account_owner}
            label="Start a trip plan"
          />
        </div>
      </div>

      {followUp !== "none" && followUp !== "upcoming" && (
        <Alert>
          <AlertTitle>{followUp === "overdue" ? `Follow-up was due ${formatDate(person.follow_up_on)}` : "Follow up today"}</AlertTitle>
          {person.follow_up_note && <AlertDescription>{person.follow_up_note}</AlertDescription>}
        </Alert>
      )}

      <Card size="sm">
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Fact label="Last contact" value={lastContactLabel(lastTouch.data?.last_touch ?? null, today)} />
          <Fact
            label="What's next"
            value={
              journey.nextStep
                ? `${journey.nextStep}${journey.nextStepDue ? ` (${formatDate(journey.nextStepDue)})` : ""}`
                : person.follow_up_on
                  ? `${person.follow_up_note ?? "Follow up"} (${formatDate(person.follow_up_on)})`
                  : "Nothing planned"
            }
          />
          <Fact label="Safaris taken" value={journey.upcomingTrip ? `${journey.tripsTaken}, plus ${journey.upcomingTrip}` : journey.tripsTaken} />
          <Fact label="Paid so far" value={formatMoney(lifetime)} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <AboutCard id={id} about={person.about} tags={person.tags} referredBy={person.referred_by} />

          <Card>
            <CardHeader>
              <CardTitle>What they&apos;re interested in</CardTitle>
              <CardDescription>{tripSummary || "They haven't told us about a trip yet."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <BadgeRow label="What excites them" items={person.interests} />
              {person.interests_other && <p className="text-sm whitespace-pre-wrap">&ldquo;{person.interests_other}&rdquo;</p>}
              <BadgeRow label="What's holding them back" items={person.objections} />
              {person.objections_other && <p className="text-sm whitespace-pre-wrap">&ldquo;{person.objections_other}&rdquo;</p>}
              {person.interests.length === 0 && person.objections.length === 0 && !person.interests_other && (
                <p className="text-sm text-muted-foreground">Nothing from your signup form.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trips</CardTitle>
              <CardDescription>Every safari they&apos;ve considered or taken.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet. Start a trip plan when a conversation turns serious, or to log a safari they&apos;ve already taken.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trip</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((plan) => {
                      const payment = summarizePayments(plan, plan.payments, today)
                      return (
                        <TableRow key={plan.id}>
                          <TableCell className="whitespace-normal">
                            <Link href={`/pipeline/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
                              {plan.trips?.name ?? "Trip not decided"}
                            </Link>
                            {plan.trips?.starts_on && <p className="text-xs text-muted-foreground">{formatDate(plan.trips.starts_on)}</p>}
                          </TableCell>
                          <TableCell>{stageLabel(plan.stage)}</TableCell>
                          <TableCell>
                            <Badge variant={payment.overdue ? "destructive" : "outline"}>
                              {payment.overdue ? `${payment.overdue === "deposit" ? "Deposit" : "Balance"} overdue` : PAYMENT_STATUS_LABELS[payment.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(payment.paid)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              {travelMates.length > 0 && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Travels with: </span>
                  {travelMates.map((mate, index) => (
                    <span key={mate.id}>
                      {index > 0 && ", "}
                      <Link href={`/subscribers/${mate.id}`} className="font-medium underline-offset-4 hover:underline">
                        {personName(mate)}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email and details</CardTitle>
              <CardDescription>{emailStatus(person)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!person.unsubscribed_at && !person.suppressed && (
                <MarketingToggle id={id} enabled={person.marketing_ok} hasEmail={Boolean(person.email)} />
              )}
              <BadgeRow label="Saved segments" items={((savedSegments.data ?? []) as unknown as { name: string }[]).map((segment) => segment.name)} />
              <BadgeRow label="Airtable segments" items={person.segments} />
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd>{person.account_owner ?? "Nobody yet"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">On your list since</dt>
                  <dd>{formatDate(person.subscribed_at)}</dd>
                </div>
                {person.source && (
                  <div>
                    <dt className="text-muted-foreground">Heard about you</dt>
                    <dd>{person.source}</dd>
                  </div>
                )}
                {person.status && (
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{person.status}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <FollowUpCard id={id} on={person.follow_up_on} note={person.follow_up_note} />
          <Card>
            <CardHeader>
              <CardTitle>Their journey</CardTitle>
              <CardDescription>Conversations, trips, payments and emails, newest first.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <NoteComposer subscriberId={id} />
              <ActivityTimeline entries={timeline} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
