"use client"

import { ArrowLeftIcon, ChevronDownIcon, ExternalLinkIcon, StarIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ActivityTimeline, NoteComposer } from "@/components/activity-timeline"
import { InlineMoney, InlineSelect, InlineText } from "@/components/inline-edit"
import { ManageMenu } from "@/components/manage-menu"
import { PersonPicker, type PersonOption } from "@/components/person-picker"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { personName, planTitle, type PlanRow, type TimelineEntry } from "@/lib/pipeline/display"
import {
  ITINERARY_STATUSES,
  OWNERS,
  PAYMENT_KINDS,
  PAYMENT_STATUS_LABELS,
  PREP_ITEMS,
  formatMoney,
  holdsSeat,
  parseMoney,
  planAttention,
  prepProgress,
  summarizePayments,
} from "@/lib/pipeline/stages"

import { addNewTraveler, addPayment, addTraveler, deletePayment, removeTraveler, setPrepItem, updatePayment, updatePlan } from "../actions"
import { NextMoveButtons, StageSelect, planActions, type TripOption } from "../journey-controls"

const NO_TRIP = "__none__"
const NO_OWNER = "__none__"
const KIND_ITEMS = PAYMENT_KINDS.map((item) => ({ value: item.key, label: item.label }))

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function PaymentsCard({ plan, today }: { plan: PlanRow; today: string }) {
  const [isPending, startTransition] = useTransition()
  const [newKind, setNewKind] = useState("deposit")
  const summary = summarizePayments(plan, plan.payments, today)
  const save = (fields: Record<string, unknown>) => updatePlan({ id: plan.id, ...fields })
  const edit = (id: string, fields: Record<string, unknown>) => updatePayment({ planId: plan.id, id, ...fields })

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePayment({ planId: plan.id, id })
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Payments</CardTitle>
        <Badge variant={summary.overdue ? "destructive" : "secondary"}>
          {summary.overdue ? `${summary.overdue === "deposit" ? "Deposit" : "Balance"} overdue` : PAYMENT_STATUS_LABELS[summary.status]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <Row label="Agreed total">
            <InlineMoney label="Agreed total" value={plan.agreed_total} onSave={(agreed_total) => save({ agreed_total })} />
          </Row>
          <Row label="Paid">
            <span className="px-1 font-medium tabular-nums">{formatMoney(summary.paid)}</span>
          </Row>
          <Row label="Deposit">
            <InlineMoney label="Deposit amount" value={plan.deposit_amount} onSave={(deposit_amount) => save({ deposit_amount })} />
          </Row>
          <Row label="Balance">
            <span className="px-1 font-medium tabular-nums">{formatMoney(summary.balance)}</span>
          </Row>
          <Row label="Deposit due">
            <InlineText label="Deposit due" type="date" value={plan.deposit_due_on} onSave={(value) => save({ deposit_due_on: value || null })} />
          </Row>
          <Row label="Balance due">
            <InlineText label="Balance due" type="date" value={plan.balance_due_on} onSave={(value) => save({ balance_due_on: value || null })} />
          </Row>
        </div>

        <Table>
          <TableBody>
            {[...plan.payments]
              .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
              .map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="w-36">
                    <InlineText label="Date received" type="date" required value={payment.paid_on} onSave={(paid_on) => edit(payment.id, { paid_on })} />
                  </TableCell>
                  <TableCell>
                    <InlineSelect label="Payment type" value={payment.kind} items={KIND_ITEMS} onSave={(kind) => edit(payment.id, { kind })} />
                  </TableCell>
                  <TableCell>
                    <InlineMoney
                      label="Amount"
                      value={payment.amount}
                      onSave={async (amount) => (amount === null ? { ok: false, error: "Remove the payment instead of blanking it." } : edit(payment.id, { amount }))}
                    />
                  </TableCell>
                  <TableCell>
                    <InlineText label="How it was paid" value={payment.method} placeholder="How" onSave={(method) => edit(payment.id, { method })} />
                  </TableCell>
                  <TableCell className="w-8 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label="Remove this payment" disabled={isPending} onClick={() => remove(payment.id)}>
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            <TableRow>
              <TableCell colSpan={2}>
                <InlineSelect label="New payment type" value={newKind} items={KIND_ITEMS} onSave={async (kind) => setNewKind(kind)} />
              </TableCell>
              <TableCell colSpan={3}>
                <InlineText
                  key={plan.payments.length}
                  label="New payment amount"
                  placeholder="Add a payment: type an amount, press Enter"
                  value={null}
                  onSave={async (text) => {
                    const amount = parseMoney(text)
                    if (amount === null || Number.isNaN(amount)) return { ok: false, error: "Enter an amount, like 3000." }
                    const result = await addPayment({ planId: plan.id, kind: newKind, amount, paid_on: today, method: null, note: null })
                    if (result.ok) toast.success(result.moved ? "Deposit recorded and moved to Committed" : "Payment recorded")
                    return result
                  }}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Travelers({ plan, people }: { plan: PlanRow; people: PersonOption[] }) {
  const [person, setPerson] = useState<string | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error)
      else done?.()
    })

  return (
    <div className="flex flex-col gap-1">
      {[...plan.trip_plan_travelers]
        .sort((a, b) => Number(b.is_lead) - Number(a.is_lead))
        .map(({ is_lead, subscribers: traveler }) => (
          <div key={traveler.id} className="flex items-center gap-2 text-sm">
            {is_lead && <StarIcon aria-label="Lead traveler" className="size-3.5 text-chart-2" />}
            <Link href={`/subscribers/${traveler.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">
              {personName(traveler)}
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${personName(traveler)}`}
              disabled={isPending || plan.trip_plan_travelers.length <= 1}
              onClick={() => run(() => removeTraveler({ planId: plan.id, subscriberId: traveler.id }))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger render={<Button variant="ghost" size="sm" className="self-start" />}>Add a traveler</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a traveler</DialogTitle>
            <DialogDescription>Someone traveling with {planTitle(plan)}.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="list">
            <TabsList>
              <TabsTrigger value="list">From your list</TabsTrigger>
              <TabsTrigger value="new">Someone new</TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="flex flex-col gap-3 pt-3">
              <PersonPicker id="add-traveler" people={people} value={person} onChange={setPerson} />
              <Button
                className="self-start"
                disabled={!person || isPending}
                onClick={() =>
                  run(
                    () => addTraveler({ planId: plan.id, subscriberId: person }),
                    () => {
                      setPerson(null)
                      setAddOpen(false)
                    }
                  )
                }
              >
                Add traveler
              </Button>
            </TabsContent>
            <TabsContent value="new" className="flex flex-col gap-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="First name" placeholder="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                <Input aria-label="Last name" placeholder="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </div>
              <Button
                className="self-start"
                disabled={!firstName.trim() || isPending}
                onClick={() =>
                  run(
                    () => addNewTraveler({ planId: plan.id, firstName, lastName }),
                    () => {
                      setFirstName("")
                      setLastName("")
                      setAddOpen(false)
                    }
                  )
                }
              >
                Add traveler
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Prep({ plan }: { plan: PlanRow }) {
  const [isPending, startTransition] = useTransition()
  const { done, total } = prepProgress(plan.prep_done)

  return (
    <Collapsible>
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ml-2" />}>
        Trip prep: {done} of {total} done
        <ChevronDownIcon data-icon="inline-end" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-2">
        {PREP_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <Checkbox
              id={`prep-${item.key}`}
              disabled={isPending}
              checked={plan.prep_done.includes(item.key)}
              onCheckedChange={(checked) =>
                startTransition(async () => {
                  const result = await setPrepItem({ planId: plan.id, item: item.key, done: Boolean(checked) })
                  if (!result.ok) toast.error(result.error)
                })
              }
            />
            <Label htmlFor={`prep-${item.key}`}>{item.label}</Label>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function PlanEditor({
  plan,
  trips,
  people,
  timeline,
  today,
}: {
  plan: PlanRow
  trips: TripOption[]
  people: PersonOption[]
  timeline: TimelineEntry[]
  today: string
}) {
  // The next step field is right on this page, so it doesn't need a banner too.
  const reasons = planAttention({ ...plan, trip: plan.trips }, today).filter((reason) => reason.message !== "No next step")
  const lead = [...plan.trip_plan_travelers].sort((a, b) => Number(b.is_lead) - Number(a.is_lead))[0]?.subscribers
  // Group departures share one itinerary. Only a custom trip has its own to track.
  const showItinerary = plan.trips?.kind !== "group"
  const save = (fields: Record<string, unknown>) => updatePlan({ id: plan.id, ...fields })

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to pipeline" render={<Link href="/pipeline" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-heading text-xl font-semibold">
          {lead ? (
            <Link href={`/subscribers/${lead.id}`} className="underline-offset-4 hover:underline">
              {planTitle(plan)}
            </Link>
          ) : (
            planTitle(plan)
          )}
        </h1>
        <ManageMenu label="Manage this trip plan" actions={planActions(plan, null, "/pipeline")} />
      </div>

      {reasons.length > 0 && (
        <Alert>
          <AlertTitle>{reasons.map((reason) => reason.message).join(". ")}</AlertTitle>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-2">
              <NextMoveButtons name={lead ? personName(lead) : planTitle(plan)} plan={plan} trips={trips} today={today} />
              <Row label="Stage">
                <StageSelect plan={plan} />
              </Row>
              <Row label="Trip">
                <div className="flex items-center gap-1">
                  <InlineSelect
                    label="Trip"
                    value={plan.trip_id ?? NO_TRIP}
                    items={[{ value: NO_TRIP, label: "Not decided yet" }, ...trips]}
                    onSave={(trip) => save({ trip_id: trip === NO_TRIP ? null : trip })}
                  />
                  {plan.trip_id && (
                    <Button variant="ghost" size="icon-xs" aria-label="Open this trip" render={<Link href={`/trips/${plan.trip_id}`} />} nativeButton={false}>
                      <ExternalLinkIcon />
                    </Button>
                  )}
                </div>
              </Row>
              <Row label="Owner">
                <InlineSelect
                  label="Owner"
                  value={plan.owner ?? NO_OWNER}
                  items={[{ value: NO_OWNER, label: "Nobody yet" }, ...[...new Set([...OWNERS, ...(plan.owner ? [plan.owner] : [])])].map((name) => ({ value: name, label: name }))]}
                  onSave={(owner) => save({ owner: owner === NO_OWNER ? null : owner })}
                />
              </Row>
              <Row label="Next step">
                <InlineText label="Next step" value={plan.next_step} placeholder="Send the July itinerary" onSave={(next_step) => save({ next_step })} />
              </Row>
              <Row label="By">
                <InlineText label="Next step due" type="date" value={plan.next_step_due} onSave={(value) => save({ next_step_due: value || null })} />
              </Row>
              {plan.stage === "not_this_time" && (
                <Row label="Why not">
                  <InlineText label="Why not this time" value={plan.closed_reason} placeholder="Cost, timing, went elsewhere" onSave={(closed_reason) => save({ closed_reason })} />
                </Row>
              )}
              {showItinerary && (
                <>
                  <Row label="Itinerary">
                    <InlineSelect
                      label="Itinerary"
                      value={plan.itinerary_status}
                      items={ITINERARY_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                      onSave={(itinerary_status) => save({ itinerary_status })}
                    />
                  </Row>
                  <Row label="Link">
                    <InlineText label="Itinerary link" type="url" value={plan.itinerary_url} placeholder="https://" onSave={(itinerary_url) => save({ itinerary_url })} />
                  </Row>
                </>
              )}
              <Row label="Traveling">
                <Travelers plan={plan} people={people} />
              </Row>
              {holdsSeat(plan.stage) && <Prep plan={plan} />}
            </CardContent>
          </Card>
          <PaymentsCard plan={plan} today={today} />
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <NoteComposer planId={plan.id} />
            <ActivityTimeline entries={timeline} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
