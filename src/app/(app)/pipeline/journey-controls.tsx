"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { InlineSelect, InlineText } from "@/components/inline-edit"
import { ManageMenu, type ManageAction } from "@/components/manage-menu"
import { SimpleSelect, type SimpleOption } from "@/components/simple-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { formatDate, type PlanRow } from "@/lib/pipeline/display"
import { PAYMENT_KINDS, PAYMENT_STATUS_LABELS, STAGES, formatMoney, isOpenStage, nextMove, parseMoney, stageLabel, summarizePayments } from "@/lib/pipeline/stages"

import { addPayment, deletePlan, recordDeposit, removeFromTrip, resetPlan, updatePlan } from "./actions"
import { NewPlanDialog } from "./new-plan-dialog"

const NO_TRIP = "__none__"
const NEW_TRIP = "__new__"

export type TripOption = SimpleOption & { price: number | null; deposit: number | null }

const STAGE_ITEMS = STAGES.map((item) => ({ value: item.key, label: item.label }))
const moneyText = (value: number | string | null | undefined) => (value === null || value === undefined ? "" : String(value))

export function StageSelect({ plan, className }: { plan: Pick<PlanRow, "id" | "stage">; className?: string }) {
  return (
    <InlineSelect
      label="Stage"
      value={plan.stage}
      items={STAGE_ITEMS}
      className={className}
      onSave={(stage) => updatePlan({ id: plan.id, stage })}
    />
  )
}

export function planActions(plan: Pick<PlanRow, "id">, personId: string | null, leaveTo?: string): ManageAction[] {
  return [
    {
      label: "Reset trip plan",
      title: "Start this trip plan over?",
      description: "Goes back to Talking and clears its payments, prep, next step and any custom price. Who's traveling stays. The history keeps a record.",
      success: "Trip plan reset",
      run: () => resetPlan(plan.id),
    },
    {
      label: personId ? "Remove from this trip" : "Remove trip plan",
      title: "Remove this from the trip?",
      description: personId
        ? "Takes them off the trip. If they're the only traveler, the plan's payments and history go too, for good."
        : "Removes the plan, its payments and its history for good.",
      destructive: true,
      success: "Removed",
      redirectTo: leaveTo,
      run: () => (personId ? removeFromTrip({ planId: plan.id, subscriberId: personId }) : deletePlan(plan.id)),
    },
  ]
}

export function PlanMenu({ plan, label }: { plan: Pick<PlanRow, "id">; label: string }) {
  return <ManageMenu label={label} actions={planActions(plan, null)} />
}

type DepositProps = {
  personId?: string | null
  owner?: string | null
  name: string
  plan: PlanRow | null
  trips: TripOption[]
  today: string
}

// Rendered inside the dialog, so it starts fresh from the plan and trip each time it opens.
function DepositForm({ personId = null, owner = null, name, plan, trips, today, onDone }: DepositProps & { onDone: () => void }) {
  const chooseTrip = !plan?.trip_id
  const [trip, setTrip] = useState(chooseTrip && trips.length === 1 ? trips[0].value : NO_TRIP)
  const selected = trips.find((item) => item.value === trip)
  const [tripName, setTripName] = useState("")
  const [amount, setAmount] = useState(moneyText(plan?.deposit_amount ?? selected?.deposit))
  const [paidOn, setPaidOn] = useState(today)
  const [isPending, startTransition] = useTransition()

  function pickTrip(value: string) {
    setTrip(value)
    setAmount(moneyText(plan?.deposit_amount ?? trips.find((item) => item.value === value)?.deposit))
  }

  function submit() {
    const parsedAmount = parseMoney(amount)
    if (parsedAmount === null || Number.isNaN(parsedAmount)) {
      toast.error("Enter an amount, like 3000.")
      return
    }
    startTransition(async () => {
      const result = await recordDeposit({
        subscriberId: personId,
        planId: plan?.id ?? null,
        tripId: chooseTrip && trip !== NO_TRIP && trip !== NEW_TRIP ? trip : null,
        newTrip: chooseTrip && trip === NEW_TRIP ? { name: tripName, starts_on: null } : null,
        owner,
        amount: parsedAmount,
        total: null,
        paid_on: paidOn,
        method: null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.moved ? `Deposit recorded. ${name} is now Committed.` : "Deposit recorded.")
      onDone()
    })
  }

  return (
    <>
      <FieldGroup>
        {chooseTrip && (
          <Field>
            <FieldLabel htmlFor="deposit-trip">Trip</FieldLabel>
            <SimpleSelect
              id="deposit-trip"
              items={[{ value: NO_TRIP, label: "Not decided yet" }, ...trips, { value: NEW_TRIP, label: "A new custom safari" }]}
              value={trip}
              onChange={pickTrip}
            />
          </Field>
        )}
        {chooseTrip && trip === NEW_TRIP && (
          <Field>
            <FieldLabel htmlFor="deposit-trip-name">Trip name</FieldLabel>
            <Input id="deposit-trip-name" value={tripName} onChange={(event) => setTripName(event.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="deposit-amount">Amount ($)</FieldLabel>
            <Input id="deposit-amount" inputMode="decimal" placeholder="3000" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="deposit-date">Received</FieldLabel>
            <Input id="deposit-date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button onClick={submit} disabled={isPending || !amount.trim() || !paidOn || (chooseTrip && trip === NEW_TRIP && !tripName.trim())}>
          {isPending && <Spinner data-icon="inline-start" />}
          Record deposit
        </Button>
      </DialogFooter>
    </>
  )
}

export function DepositDialog({ variant = "default", size = "default", ...props }: DepositProps & { variant?: "default" | "outline"; size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false)
  const tripName = props.plan?.trips?.name
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size={size} />}>Record a deposit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a deposit</DialogTitle>
          <DialogDescription>
            {tripName ? `From ${props.name}, for ${tripName}.` : `From ${props.name}.`} This moves them to Committed.
          </DialogDescription>
        </DialogHeader>
        <DepositForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

// Compact is for a row in a list: only the one usual move, since the row can already record money.
export function NextMoveButtons({ plan, compact, ...props }: Omit<DepositProps, "plan"> & { plan: PlanRow; compact?: boolean }) {
  const [isPending, startTransition] = useTransition()
  const paid = summarizePayments(plan, plan.payments, props.today).paid
  const move = nextMove(plan.stage, paid)
  if (!move) return null
  const size = compact ? "sm" : "default"

  const advance = (stage: string) =>
    startTransition(async () => {
      const result = await updatePlan({ id: plan.id, stage })
      if (!result.ok) toast.error(result.error)
      else toast.success(`Moved to ${stageLabel(stage)}`)
    })

  return (
    <div className="flex flex-wrap gap-2">
      {move.kind === "stage" ? (
        <Button size={size} disabled={isPending} onClick={() => advance(move.stage)}>
          {isPending && <Spinner data-icon="inline-start" />}
          {move.label}
        </Button>
      ) : (
        <DepositDialog {...props} plan={plan} size={size} />
      )}
      {!compact && move.kind === "stage" && paid <= 0 && <DepositDialog {...props} plan={plan} variant="outline" />}
    </div>
  )
}

export function NextStepField({ plan }: { plan: Pick<PlanRow, "id" | "next_step"> }) {
  return (
    <InlineText
      label="Next step"
      value={plan.next_step}
      placeholder="Add the next step"
      className="-mx-1 text-xs text-muted-foreground"
      onSave={(next_step) => updatePlan({ id: plan.id, next_step })}
    />
  )
}

const PAYMENT_KIND_ITEMS = PAYMENT_KINDS.map((item) => ({ value: item.key, label: item.label }))

// Rendered inside the dialog, so it starts fresh each time it opens.
function PaymentForm({ plan, today, onDone }: { plan: PlanRow; today: string; onDone: () => void }) {
  const summary = summarizePayments(plan, plan.payments, today)
  const suggested = (value: string) => {
    if (value === "deposit") return moneyText(plan.deposit_amount)
    if (value === "balance" && summary.balance !== null && summary.balance > 0) return moneyText(summary.balance)
    return ""
  }
  const firstKind = summary.paid > 0 ? "balance" : "deposit"
  const [kind, setKind] = useState<string>(firstKind)
  const [amount, setAmount] = useState(suggested(firstKind))
  const [paidOn, setPaidOn] = useState(today)
  const [isPending, startTransition] = useTransition()

  function submit() {
    const parsed = parseMoney(amount)
    if (parsed === null || Number.isNaN(parsed)) {
      toast.error("Enter an amount, like 3000.")
      return
    }
    startTransition(async () => {
      const result = await addPayment({ planId: plan.id, kind, amount: parsed, paid_on: paidOn, method: null, note: null })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.moved ? "Payment recorded. They're now Committed." : "Payment recorded.")
      onDone()
    })
  }

  return (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="payment-kind">Type</FieldLabel>
          <SimpleSelect
            id="payment-kind"
            items={PAYMENT_KIND_ITEMS}
            value={kind}
            onChange={(value) => {
              setKind(value)
              setAmount(suggested(value))
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="payment-amount">Amount ($)</FieldLabel>
            <Input id="payment-amount" inputMode="decimal" placeholder="3000" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="payment-date">Received</FieldLabel>
            <Input id="payment-date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button onClick={submit} disabled={isPending || !amount.trim() || !paidOn}>
          {isPending && <Spinner data-icon="inline-start" />}
          Record payment
        </Button>
      </DialogFooter>
    </>
  )
}

// A row's payment status is also how you add to it.
export function PaymentDialog({ plan, name, today }: { plan: PlanRow; name: string; today: string }) {
  const [open, setOpen] = useState(false)
  const summary = summarizePayments(plan, plan.payments, today)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="-ml-2 h-auto flex-col items-start gap-0.5 rounded-lg py-1" aria-label={`Record a payment from ${name}`} />}>
        <Badge variant={summary.overdue ? "destructive" : "outline"}>
          {summary.overdue ? `${summary.overdue === "deposit" ? "Deposit" : "Balance"} overdue` : PAYMENT_STATUS_LABELS[summary.status]}
        </Badge>
        {summary.balance !== null && <span className="font-normal text-muted-foreground tabular-nums">{formatMoney(summary.balance)} left</span>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            From {name}. {formatMoney(summary.paid)} paid so far{summary.balance === null ? "." : `, ${formatMoney(summary.balance)} left.`}
          </DialogDescription>
        </DialogHeader>
        <PaymentForm plan={plan} today={today} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

// Everything about their trips, on their profile. The stage and next step change right here.
export function TripsCard({
  personId,
  name,
  owner,
  plans,
  trips,
  today,
}: {
  personId: string
  name: string
  owner: string | null
  plans: PlanRow[]
  trips: TripOption[]
  today: string
}) {
  const current = plans.find((plan) => isOpenStage(plan.stage)) ?? null
  const onTrip = plans.filter((plan) => plan.trip_id && plan.stage !== "not_this_time")
  const duplicated = new Set(onTrip.filter((plan, index) => onTrip.findIndex((other) => other.trip_id === plan.trip_id) !== index).map((plan) => plan.trip_id))
  const taken = new Set(onTrip.map((plan) => plan.trip_id))
  const startable = trips.filter((trip) => !taken.has(trip.value))

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Trips</CardTitle>
        <div className="flex flex-wrap gap-2">
          {!current && <DepositDialog personId={personId} owner={owner} name={name} plan={null} trips={startable} today={today} />}
          <NewPlanDialog people={[]} trips={startable} personId={personId} defaultOwner={owner} label="Add to a trip" variant={current ? "ghost" : "outline"} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {duplicated.size > 0 && (
          <Alert variant="destructive">
            <AlertTitle>{name} is on the same trip more than once</AlertTitle>
            <AlertDescription>Use ⋯ on the one that&apos;s wrong to remove it.</AlertDescription>
          </Alert>
        )}
        {plans.length > 0 && (
          <Table>
            <TableBody>
              {plans.map((plan) => {
                const payment = summarizePayments(plan, plan.payments, today)
                return (
                  <TableRow key={plan.id}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/pipeline/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
                        {plan.trips?.name ?? "Trip not decided"}
                      </Link>
                      {duplicated.has(plan.trip_id) && <Badge variant="destructive" className="ml-2">Duplicate</Badge>}
                      <p className="text-xs text-muted-foreground">
                        {plan.trips?.starts_on ? `${formatDate(plan.trips.starts_on)} · ` : ""}
                        {formatMoney(payment.paid)} paid
                        {payment.balance === null ? "" : `, ${formatMoney(payment.balance)} left`}
                      </p>
                    </TableCell>
                    <TableCell className="w-44">
                      <StageSelect plan={plan} />
                    </TableCell>
                    <TableCell className="w-10 text-right">
                      <ManageMenu label={`Manage ${plan.trips?.name ?? "this trip plan"}`} actions={planActions(plan, personId)} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        {current && (
          <div className="flex flex-col gap-2">
            <NextMoveButtons personId={personId} owner={owner} name={name} plan={current} trips={trips} today={today} />
            <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
              <InlineText
                label="Next step"
                value={current.next_step}
                placeholder="Add the next step"
                onSave={(next_step) => updatePlan({ id: current.id, next_step })}
              />
              <InlineText
                label="Next step due"
                type="date"
                value={current.next_step_due}
                onSave={(next_step_due) => updatePlan({ id: current.id, next_step_due: next_step_due || null })}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
