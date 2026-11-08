import { CheckCircle2Icon, CircleAlertIcon, ClockIcon, InfoIcon } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { loadAttention, type AttentionItem } from "@/lib/pipeline/attention"
import { formatDate, personName } from "@/lib/pipeline/display"
import { formatMoney, holdsSeat, isOpenStage } from "@/lib/pipeline/stages"

import { NewPlanDialog } from "../pipeline/new-plan-dialog"
import { AddPersonDialog } from "../subscribers/add-person-dialog"
import { ReminderDone } from "./reminder-done"

export const metadata = { title: "Today" }

const URGENCY = {
  overdue: { icon: CircleAlertIcon, className: "text-destructive" },
  today: { icon: ClockIcon, className: "text-chart-4" },
  soon: { icon: ClockIcon, className: "text-chart-4" },
  other: { icon: InfoIcon, className: "text-muted-foreground" },
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { icon: Icon, className } = URGENCY[item.urgency]
  return (
    <TableRow className="relative">
      <TableCell className="w-6 pr-0 align-top">
        <Icon className={`mt-0.5 size-4 ${className}`} />
      </TableCell>
      <TableCell className="whitespace-normal">
        <Link href={item.href} className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline">
          {item.name}
        </Link>
        <p className="text-muted-foreground">{item.message}</p>
      </TableCell>
      <TableCell className="w-20 text-right">{item.reminderFor && <ReminderDone id={item.reminderFor} name={item.name} />}</TableCell>
    </TableRow>
  )
}

export default async function TodayPage() {
  const { supabase } = await requireTeamMember()
  const { items, review, people, plans, openPlanCount, balanceDue, today } = await loadAttention(supabase)

  const { data: trips, error } = await supabase
    .from("trips")
    .select("id, name, starts_on, seats")
    .eq("archived", false)
    .gte("starts_on", today)
    .order("starts_on")
    .limit(3)
  if (error) throw new Error(error.message)

  const { data: planTrips, error: planTripsError } = await supabase
    .from("trips")
    .select("id, name")
    .eq("archived", false)
    .order("starts_on")
  if (planTripsError) throw new Error(planTripsError.message)

  const seatsFor = (tripId: string) =>
    plans
      .filter((plan) => plan.trip_id === tripId && holdsSeat(plan.stage))
      .reduce((sum, plan) => sum + plan.trip_plan_travelers.length, 0)
  const talkingFor = (tripId: string) =>
    plans.filter((plan) => plan.trip_id === tripId && isOpenStage(plan.stage) && !holdsSeat(plan.stage)).length

  const stats = [
    { label: "People", value: String(people.length), href: "/subscribers" },
    { label: "Open trip plans", value: String(openPlanCount), href: "/pipeline" },
    { label: "Still to collect", value: formatMoney(balanceDue), href: "/trips" },
  ]

  return (
    <>
      <PageHeader title="Today" description="What needs you, and how your trips are looking.">
        <div className="flex flex-wrap gap-2">
          <AddPersonDialog />
          <NewPlanDialog
            people={people.map((person) => ({ value: person.id, label: personName(person) }))}
            trips={planTrips.map((trip) => ({ value: trip.id as string, label: trip.name as string }))}
          />
        </div>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm" className="relative">
            <CardHeader>
              <CardDescription>
                <Link href={stat.href} className="after:absolute after:inset-0">
                  {stat.label}
                </Link>
              </CardDescription>
              <CardTitle className="text-xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Needs you</CardTitle>
              <CardDescription>Late money, overdue next steps, reminders and past guests worth a call.</CardDescription>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CheckCircle2Icon />
                    </EmptyMedia>
                    <EmptyTitle>You&apos;re all caught up</EmptyTitle>
                    <EmptyDescription>Reminders and next steps you set will show up here when they&apos;re due.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableBody>
                    {items.map((item) => (
                      <AttentionRow key={item.key} item={item} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {review.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Worth reviewing</CardTitle>
                <CardDescription>
                  Airtable suggests these people have booked or traveled, but they have no trip plan yet. Open each one and start a plan if it&apos;s right.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {review.map((person) => (
                      <TableRow key={person.id} className="relative">
                        <TableCell className="font-medium">
                          <Link href={`/subscribers/${person.id}`} className="underline-offset-4 after:absolute after:inset-0 hover:underline">
                            {person.name}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-normal text-muted-foreground">{person.reasons.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            {(trips ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming trips. <Link href="/trips" className="underline underline-offset-4">Add one</Link>.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {(trips ?? []).map((trip) => (
                  <li key={trip.id} className="relative">
                    <Link href={`/trips/${trip.id}`} className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline">
                      {trip.name}
                    </Link>
                    <p className="text-muted-foreground">{formatDate(trip.starts_on)}</p>
                    <p className="text-muted-foreground tabular-nums">
                      {seatsFor(trip.id)}
                      {trip.seats ? ` of ${trip.seats}` : ""} seats taken · {talkingFor(trip.id)} in talks
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
