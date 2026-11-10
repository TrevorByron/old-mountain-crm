import { MapIcon } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { todayIso } from "@/lib/pipeline/display"
import { formatMoney, holdsSeat, isOpenStage, seatsTaken, summarizePayments } from "@/lib/pipeline/stages"

import { TripDialog } from "./trip-dialog"
import { TripMenu, TripRowDates, TripRowSeats } from "./trip-fields"

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
      <PageHeader title="Trips" description="Click any date or seat count to change it." fab={<TripDialog fab />}>
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
          <CardHeader>
            <CardTitle>All trips</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trip</TableHead>
                  <TableHead className="hidden md:table-cell">Dates</TableHead>
                  <TableHead className="hidden sm:table-cell">Seats taken</TableHead>
                  <TableHead className="hidden sm:table-cell">In talks</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Collected</TableHead>
                  <TableHead />
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
                      {/* Phones show the numbers as one line here instead of in their own columns. */}
                      <p className="text-sm text-muted-foreground tabular-nums sm:hidden">
                        {trip.taken}
                        {trip.seats ? ` of ${trip.seats}` : ""} seats · {formatMoney(trip.collected)} collected
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <TripRowDates trip={trip} />
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      <div className="flex items-center gap-1">
                        {trip.taken} of
                        <TripRowSeats trip={trip} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">{trip.talking}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(trip.collected)}</TableCell>
                    <TableCell className="w-10 text-right">
                      <TripMenu trip={trip} />
                    </TableCell>
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
