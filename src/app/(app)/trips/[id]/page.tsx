import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ArrowLeftIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { PLAN_COLUMNS, planTitle, todayIso, type PlanRow } from "@/lib/pipeline/display"
import {
  PAYMENT_STATUS_LABELS,
  formatMoney,
  holdsSeat,
  isOpenStage,
  seatsTaken,
  summarizePayments,
} from "@/lib/pipeline/stages"

import { PlanMenu, StageSelect } from "../../pipeline/journey-controls"
import { TripDetails, TripMenu, TripName, type TripFields } from "../trip-fields"

export const metadata = { title: "Trip" }

function PlanTable({ plans, today }: { plans: PlanRow[]; today: string }) {
  const seen = plans.flatMap((plan) => plan.trip_plan_travelers.map((traveler) => traveler.subscribers.id))
  const repeated = new Set(seen.filter((id, index) => seen.indexOf(id) !== index))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Who</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead className="text-right">Left to pay</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {plans.map((plan) => {
          const payment = summarizePayments(plan, plan.payments, today)
          return (
            <TableRow key={plan.id}>
              <TableCell className="font-medium">
                <Link href={`/pipeline/${plan.id}`} className="underline-offset-4 hover:underline">
                  {planTitle(plan)}
                </Link>
                {plan.trip_plan_travelers.some((traveler) => repeated.has(traveler.subscribers.id)) && (
                  <Badge variant="destructive" className="ml-2">
                    Duplicate
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <StageSelect plan={{ id: plan.id, stage: plan.stage }} />
              </TableCell>
              <TableCell>
                <Badge variant={payment.overdue ? "destructive" : "outline"}>
                  {payment.overdue ? `${payment.overdue === "deposit" ? "Deposit" : "Balance"} overdue` : PAYMENT_STATUS_LABELS[payment.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(payment.balance)}</TableCell>
              <TableCell className="w-10 text-right">
                <PlanMenu plan={{ id: plan.id }} label={`Manage ${planTitle(plan)}`} />
              </TableCell>
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

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to trips" render={<Link href="/trips" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <TripName trip={trip} />
        </div>
        {trip.archived && <Badge variant="outline">Archived</Badge>}
        <TripMenu trip={trip} leaveTo="/trips" />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        {trip.seats ? `${taken} of ${trip.seats}` : taken} seats taken · {talking.length} in talks · {formatMoney(collected)} collected · {formatMoney(outstanding)} to collect
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <TripDetails trip={trip as TripFields} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {booked.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has committed yet.</p> : <PlanTable plans={booked} today={today} />}
        </CardContent>
      </Card>

      {talking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>In talks</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanTable plans={talking} today={today} />
          </CardContent>
        </Card>
      )}

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Not this time</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanTable plans={closed} today={today} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
