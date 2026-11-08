import { MapIcon } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { formatDate, todayIso } from "@/lib/pipeline/display"
import { formatMoney, holdsSeat, isOpenStage, seatsTaken, summarizePayments } from "@/lib/pipeline/stages"

import { TripDialog } from "./trip-dialog"

export const metadata = { title: "Trips" }

type TripPlanSummary = {
  stage: string
  agreed_total: number | null
  deposit_amount: number | null
  deposit_due_on: string | null
  balance_due_on: string | null
  trip_plan_travelers: { subscriber_id: string }[]
  payments: { kind: string; amount: number }[]
}

export default async function TripsPage() {
  const { supabase } = await requireTeamMember()

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, name, kind, starts_on, ends_on, seats, archived, trip_plans (stage, agreed_total, deposit_amount, deposit_due_on, balance_due_on, trip_plan_travelers (subscriber_id), payments (kind, amount))"
    )
    .order("starts_on", { nullsFirst: false })
  if (error) throw new Error(error.message)

  const today = todayIso()
  const trips = data.map((trip) => {
    const plans = trip.trip_plans as unknown as TripPlanSummary[]
    const booked = plans.filter((plan) => holdsSeat(plan.stage))
    return {
      ...trip,
      taken: seatsTaken(plans.map((plan) => ({ stage: plan.stage, travelers: plan.trip_plan_travelers.length }))),
      talking: plans.filter((plan) => isOpenStage(plan.stage) && !holdsSeat(plan.stage)).length,
      collected: booked.reduce((sum, plan) => sum + summarizePayments(plan, plan.payments, today).paid, 0),
    }
  })

  return (
    <>
      <PageHeader title="Trips" description="Your departures and custom safaris, with who's on them.">
        <TripDialog />
      </PageHeader>
      {trips.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapIcon />
            </EmptyMedia>
            <EmptyTitle>No trips yet</EmptyTitle>
            <EmptyDescription>Add a departure so people can be matched to it.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <TripDialog />
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trip</TableHead>
                  <TableHead className="hidden md:table-cell">Dates</TableHead>
                  <TableHead>Seats taken</TableHead>
                  <TableHead className="hidden sm:table-cell">In talks</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((trip) => (
                  <TableRow key={trip.id} className="relative">
                    <TableCell className="whitespace-normal">
                      <Link href={`/trips/${trip.id}`} className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline">
                        {trip.name}
                      </Link>{" "}
                      {trip.kind === "custom" && <Badge variant="outline">Custom</Badge>}{" "}
                      {trip.archived && <Badge variant="outline">Archived</Badge>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(trip.starts_on)} to {formatDate(trip.ends_on)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {trip.taken}
                      {trip.seats ? ` of ${trip.seats}` : ""}
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">{trip.talking}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(trip.collected)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
