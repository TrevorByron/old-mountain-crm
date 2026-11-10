import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { ArrowLeftIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { PLAN_COLUMNS, personName, planTitle, todayIso, type PlanRow } from "@/lib/pipeline/display"
import { formatMoney, holdsSeat, isOpenStage, seatsTaken, summarizePayments } from "@/lib/pipeline/stages"

import { NextMoveButtons, NextStepField, PaymentDialog, PlanMenu, StageSelect } from "../../pipeline/journey-controls"
import { AddToTripDialog } from "../add-to-trip-dialog"
import { ItinerarySection, type ItineraryRow } from "../itinerary-section"
import { TripDetails, TripMenu, TripName, type TripFields } from "../trip-fields"

export const metadata = { title: "Trip" }

const PAGE_SIZE = 1000

function PlanRows({ title, plans, repeated, today }: { title: string; plans: PlanRow[]; repeated: Set<string>; today: string }) {
  if (plans.length === 0) return null
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={5} className="pt-4 text-xs font-medium text-muted-foreground">
          {title} ({plans.length})
        </TableCell>
      </TableRow>
      {plans.map((plan) => (
        <TableRow key={plan.id}>
          <TableCell className="whitespace-normal max-sm:w-full sm:min-w-44">
            <Link href={`/pipeline/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
              {planTitle(plan)}
            </Link>
            {plan.trip_plan_travelers.some((traveler) => repeated.has(traveler.subscribers.id)) && (
              <Badge variant="destructive" className="ml-2">
                Duplicate
              </Badge>
            )}
            <NextStepField plan={plan} />
            {/* Phones have no room for the Stage and Payment columns, so they sit under the name. */}
            <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
              <StageSelect plan={{ id: plan.id, stage: plan.stage }} />
              <PaymentDialog plan={plan} name={planTitle(plan)} today={today} />
            </div>
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <StageSelect plan={{ id: plan.id, stage: plan.stage }} />
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <PaymentDialog plan={plan} name={planTitle(plan)} today={today} />
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <NextMoveButtons compact name={planTitle(plan)} plan={plan} trips={[]} today={today} />
          </TableCell>
          <TableCell className="w-10 text-right">
            <PlanMenu plan={{ id: plan.id }} label={`Manage ${planTitle(plan)}`} />
          </TableCell>
        </TableRow>
      ))}
    </>
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

  const { data: days, error: daysError } = await supabase
    .from("trip_itinerary_days")
    .select("id, label, title, description, stay")
    .eq("trip_id", id)
    .order("position")
  if (daysError) throw new Error(daysError.message)

  const everyone: { id: string; first_name: string | null; last_name: string | null; email: string | null }[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: pageError } = await supabase
      .from("subscribers")
      .select("id, first_name, last_name, email")
      .order("first_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (pageError) throw new Error(pageError.message)
    everyone.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  const today = todayIso()
  const booked = plans.filter((plan) => holdsSeat(plan.stage))
  const talking = plans.filter((plan) => isOpenStage(plan.stage) && !holdsSeat(plan.stage))
  const closed = plans.filter((plan) => plan.stage === "not_this_time")
  const taken = seatsTaken(plans.map((plan) => ({ stage: plan.stage, travelers: plan.trip_plan_travelers.length })))
  const summaries = booked.map((plan) => summarizePayments(plan, plan.payments, today))
  const collected = summaries.reduce((sum, item) => sum + item.paid, 0)
  const outstanding = summaries.reduce((sum, item) => sum + Math.max(0, item.balance ?? 0), 0)

  const seen = plans.flatMap((plan) => plan.trip_plan_travelers.map((traveler) => traveler.subscribers.id))
  const repeated = new Set(seen.filter((person, index) => seen.indexOf(person) !== index))
  // Someone who said "not this time" can come back, so they stay on the list to add.
  const onTrip = new Set(
    plans.filter((plan) => plan.stage !== "not_this_time").flatMap((plan) => plan.trip_plan_travelers.map((traveler) => traveler.subscribers.id))
  )
  const people = everyone
    .filter((person) => !onTrip.has(person.id))
    .map((person) => ({
      value: person.id,
      label: person.email && personName(person) !== person.email ? `${personName(person)} (${person.email})` : personName(person),
    }))

  const stats = [
    { label: "Seats taken", value: trip.seats ? `${taken} of ${trip.seats}` : String(taken) },
    { label: "In talks", value: String(talking.length) },
    { label: "Collected", value: formatMoney(collected) },
    { label: "To collect", value: formatMoney(outstanding) },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to trips" render={<Link href="/trips" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <TripName trip={trip} />
        </div>
        {trip.archived && <Badge variant="outline">Archived</Badge>}
        <div className="order-last w-full sm:order-none sm:w-auto">
          <AddToTripDialog tripId={trip.id} tripName={trip.name} people={people} />
        </div>
        <TripMenu trip={trip} leaveTo="/trips" />
      </div>

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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is on this trip yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Who</TableHead>
                    <TableHead className="hidden sm:table-cell">Stage</TableHead>
                    <TableHead className="hidden sm:table-cell">Payment</TableHead>
                    <TableHead className="hidden sm:table-cell">Next</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <PlanRows title="Roster" plans={booked} repeated={repeated} today={today} />
                  <PlanRows title="In talks" plans={talking} repeated={repeated} today={today} />
                  <PlanRows title="Not this time" plans={closed} repeated={repeated} today={today} />
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="xl:row-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <TripDetails trip={trip as TripFields} />
          </CardContent>
        </Card>

        <ItinerarySection tripId={trip.id} canPull={trip.kind === "group"} days={days as ItineraryRow[]} />
      </div>
    </>
  )
}
