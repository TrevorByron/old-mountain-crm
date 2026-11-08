import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { PLAN_COLUMNS, formatDate, planTitle, todayIso, type PlanRow } from "@/lib/pipeline/display"
import {
  PAYMENT_STATUS_LABELS,
  formatMoney,
  holdsSeat,
  isOpenStage,
  itineraryLabel,
  prepProgress,
  seatsTaken,
  stageLabel,
  summarizePayments,
} from "@/lib/pipeline/stages"

import { TripDialog, type TripFields } from "../trip-dialog"

export const metadata = { title: "Trip" }

function PlanTable({ plans, today, showPrep }: { plans: PlanRow[]; today: string; showPrep: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Who</TableHead>
          <TableHead className="text-right">People</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Left</TableHead>
          <TableHead className="hidden lg:table-cell">Itinerary</TableHead>
          {showPrep && <TableHead className="hidden md:table-cell">Prep</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {plans.map((plan) => {
          const payment = summarizePayments(plan, plan.payments, today)
          const prep = prepProgress(plan.prep_done)
          return (
            <TableRow key={plan.id} className="relative">
              <TableCell className="font-medium">
                <Link href={`/pipeline/${plan.id}`} className="underline-offset-4 after:absolute after:inset-0 hover:underline">
                  {planTitle(plan)}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{plan.trip_plan_travelers.length}</TableCell>
              <TableCell>{stageLabel(plan.stage)}</TableCell>
              <TableCell>
                <Badge variant={payment.overdue ? "destructive" : "outline"}>
                  {payment.overdue ? `${payment.overdue === "deposit" ? "Deposit" : "Balance"} overdue` : PAYMENT_STATUS_LABELS[payment.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(payment.paid)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(payment.balance)}</TableCell>
              <TableCell className="hidden lg:table-cell">{itineraryLabel(plan.itinerary_status)}</TableCell>
              {showPrep && (
                <TableCell className="hidden tabular-nums md:table-cell">
                  {prep.done} of {prep.total}
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default async function TripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const { supabase } = await requireTeamMember()

  const { data: trip, error } = await supabase
    .from("trips")
    .select("id, name, kind, starts_on, ends_on, seats, price_per_person, deposit_per_person, balance_due_on, notes, archived")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!trip) notFound()

  const { data: planRows, error: plansError } = await supabase
    .from("trip_plans")
    .select(PLAN_COLUMNS)
    .eq("trip_id", id)
    .order("created_at")
  if (plansError) throw new Error(plansError.message)
  const plans = planRows as unknown as PlanRow[]

  const today = todayIso()
  const booked = plans.filter((plan) => holdsSeat(plan.stage))
  const talking = plans.filter((plan) => isOpenStage(plan.stage) && !holdsSeat(plan.stage))
  const closed = plans.filter((plan) => plan.stage === "not_this_time")
  const taken = seatsTaken(plans.map((plan) => ({ stage: plan.stage, travelers: plan.trip_plan_travelers.length })))
  const summaries = booked.map((plan) => summarizePayments(plan, plan.payments, today))
  const collected = summaries.reduce((sum, item) => sum + item.paid, 0)
  const outstanding = summaries.reduce((sum, item) => sum + Math.max(0, item.balance ?? 0), 0)
  const missingTotals = summaries.filter((item) => item.balance === null).length

  const stats = [
    { label: "Seats taken", value: trip.seats ? `${taken} of ${trip.seats}` : String(taken) },
    { label: "In talks", value: String(talking.length) },
    { label: "Collected", value: formatMoney(collected) },
    { label: "Still to collect", value: formatMoney(outstanding) },
  ]

  return (
    <>
      <PageHeader
        title={trip.name}
        description={`${formatDate(trip.starts_on)} to ${formatDate(trip.ends_on)}${trip.price_per_person ? ` · ${formatMoney(trip.price_per_person)} per person` : ""}`}
      >
        <TripDialog trip={trip as TripFields} />
      </PageHeader>

      {trip.notes && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{trip.notes}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {missingTotals > 0 && (
        <p className="text-sm text-muted-foreground">
          &ldquo;Still to collect&rdquo; leaves out {missingTotals} booking{missingTotals === 1 ? "" : "s"} with no agreed total.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>Everyone who has committed. People count toward seats from here.</CardDescription>
        </CardHeader>
        <CardContent>
          {booked.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has committed yet.</p>
          ) : (
            <PlanTable plans={booked} today={today} showPrep />
          )}
        </CardContent>
      </Card>

      {talking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>In talks</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanTable plans={talking} today={today} showPrep={false} />
          </CardContent>
        </Card>
      )}

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Not this time</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {closed.map((plan) => (
                <li key={plan.id}>
                  <Link href={`/pipeline/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
                    {planTitle(plan)}
                  </Link>
                  {plan.closed_reason && <span className="text-muted-foreground"> · {plan.closed_reason}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
