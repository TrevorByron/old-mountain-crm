import { ChevronLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ActivityTimeline, NoteComposer } from "@/components/activity-timeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { requireTeamMember } from "@/lib/auth"
import { sendTimelineEntries } from "@/lib/broadcasts/results"
import { summarizeEngagement, type EngagementEvent, type EngagementSend } from "@/lib/people/engagement"
import { companions, followUpState, lastContactLabel, tripInterestSummary } from "@/lib/people/profile"
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
import { lifecycleLabel } from "@/lib/pipeline/stages"

import { TripsCard } from "../../pipeline/journey-controls"
import { PersonAnalytics } from "./person-analytics"
import { ContactButtons, PersonHeader, PersonMenu, ProfileCards } from "./person-panels"

export const metadata = { title: "Person" }

// Which browser or phone opened or clicked, read from the Resend event, for the Analytics tab.
type SendWithAgents = Omit<EngagementSend, "email_events"> & { email_events: (EngagementEvent & { open_agent: string | null; click_agent: string | null })[] }

const NOTE_KINDS = ["note", "call", "email", "meeting"]

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

export default async function PersonPage({ params, searchParams }: PageProps<"/subscribers/[id]">) {
  const { id } = await params
  const { tab } = await searchParams
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
      supabase.from("trips").select("id, name, price_per_person, deposit_per_person").eq("archived", false).order("starts_on"),
      supabase.from("statuses").select("value").order("position"),
      supabase.rpc("person_segments", { target: id }).select("id, name"),
      supabase.from("activities").select("id, kind, body, meta, author, occurred_at").eq("subscriber_id", id),
      supabase.from("activities").select("id, kind, body, meta, author, occurred_at, trip_plan_id").in("trip_plan_id", planIds),
      supabase.from("subscriber_status_history").select("id, from_status, to_status, changed_by, changed_at").eq("subscriber_id", id),
      supabase.from("sends").select("id, subject, sent_at, broadcast_id, email_events (id, type, link_url, occurred_at, is_probable_bot, open_agent:raw->data->open->>userAgent, click_agent:raw->data->click->>userAgent)").eq("subscriber_id", id).not("sent_at", "is", null),
    ])
  for (const result of [lifecycle, lastTouch, planResult, trips, statuses, savedSegments, ownNotes, planActivity, statusHistory, sends]) {
    if (result.error) throw new Error(result.error.message)
  }

  const plans = (planResult.data ?? []) as unknown as PlanRow[]
  const today = todayIso()
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
    ...(sends.data ?? []).flatMap((row) => sendTimelineEntries(row)),
  ])

  const hasSignupAnswers = Boolean(tripSummary) || person.interests.length > 0 || person.objections.length > 0 || Boolean(person.interests_other) || Boolean(person.objections_other)
  const savedSegmentNames = ((savedSegments.data ?? []) as unknown as { name: string }[]).map((segment) => segment.name)

  const engagement = summarizeEngagement(
    ((sends.data ?? []) as unknown as SendWithAgents[]).map((row) => ({
      ...row,
      email_events: row.email_events.map((event) => ({ ...event, user_agent: event.open_agent ?? event.click_agent })),
    }))
  )
  const lifecycleName = lifecycleLabel(lifecycle.data?.lifecycle ?? "subscriber")

  return (
    <>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="-ml-3" render={<Link href="/subscribers" />} nativeButton={false}>
          <ChevronLeftIcon data-icon="inline-start" />
          Audience
        </Button>
        <PersonMenu person={person} />
      </div>

      {/* A centered heading like Flodesk's person view, then their relationship and their email analytics as two tabs. */}
      <div className="flex flex-col items-center gap-3">
        <PersonHeader person={person} />
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground">
          <Badge variant="secondary">{lifecycleName}</Badge>
          Last contact: {lastContactLabel(lastTouch.data?.last_touch ?? null, today)}
          {" · "}On your list since {formatDate(person.subscribed_at)}
        </p>
        <ContactButtons email={person.email} phone={person.phone} />
      </div>

      <Tabs defaultValue={tab === "analytics" ? "analytics" : "relationship"} className="items-center gap-8">
        <TabsList>
          <TabsTrigger value="relationship" className="flex-none">
            Relationship
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex-none">
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="relationship" className="flex w-full max-w-2xl flex-col gap-6">
          {followUp !== "none" && followUp !== "upcoming" && (
            <Alert>
              <AlertTitle>{followUp === "overdue" ? `Follow-up was due ${formatDate(person.follow_up_on)}` : "Follow up today"}</AlertTitle>
              {person.follow_up_note && <AlertDescription>{person.follow_up_note}</AlertDescription>}
            </Alert>
          )}

          <TripsCard
            personId={id}
            name={personName(person)}
            owner={person.account_owner}
            plans={plans}
            trips={(trips.data ?? []).map((trip) => ({
              value: trip.id as string,
              label: trip.name as string,
              price: trip.price_per_person as number | null,
              deposit: trip.deposit_per_person as number | null,
            }))}
            today={today}
          />
          {travelMates.length > 0 && (
            <p className="-mt-2 px-1 text-sm">
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

          <Card>
            <CardHeader>
              <CardTitle>Notes and history</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <NoteComposer subscriberId={id} />
              <ActivityTimeline entries={timeline} />
            </CardContent>
          </Card>

          <ProfileCards person={person} statuses={(statuses.data ?? []).map((status) => status.value as string)} />

          {(hasSignupAnswers || savedSegmentNames.length > 0 || person.segments.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Segments and signup</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {tripSummary && <p className="text-sm">{tripSummary}</p>}
                <BadgeRow label="Saved segments" items={savedSegmentNames} />
                <BadgeRow label="Airtable segments" items={person.segments} />
                <BadgeRow label="What excites them" items={person.interests} />
                {person.interests_other && <p className="text-sm whitespace-pre-wrap">&ldquo;{person.interests_other}&rdquo;</p>}
                <BadgeRow label="What's holding them back" items={person.objections} />
                {person.objections_other && <p className="text-sm whitespace-pre-wrap">&ldquo;{person.objections_other}&rdquo;</p>}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="w-full max-w-2xl">
          <PersonAnalytics engagement={engagement} />
        </TabsContent>
      </Tabs>
    </>
  )
}
