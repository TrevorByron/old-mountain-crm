"use client"

import { ArrowLeftIcon, ChevronDownIcon, ExternalLinkIcon, StarIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ActivityTimeline, NoteComposer } from "@/components/activity-timeline"
import { PersonPicker, type PersonOption } from "@/components/person-picker"
import { SimpleSelect, type SimpleOption } from "@/components/simple-select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDate, personName, planTitle, type PlanRow, type TimelineEntry } from "@/lib/pipeline/display"
import {
  ITINERARY_STATUSES,
  OWNERS,
  PAYMENT_KINDS,
  PAYMENT_STATUS_LABELS,
  PREP_ITEMS,
  STAGES,
  formatMoney,
  holdsSeat,
  paymentKindLabel,
  planAttention,
  prepProgress,
  summarizePayments,
} from "@/lib/pipeline/stages"

import {
  addNewTraveler,
  addPayment,
  addTraveler,
  deletePayment,
  deletePlan,
  removeTraveler,
  setPrepItem,
  updatePlan,
} from "../actions"

const NO_TRIP = "__none__"
const NO_OWNER = "__none__"

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "")
  if (!cleaned) return null
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : Number.NaN
}

// Saves as you type, so there's no save button to forget. Amounts and links wait until you
// leave the field, because they aren't valid until they're finished.
function AutoSaveInput({
  id,
  value,
  onSave,
  type,
  placeholder,
  saveOnBlurOnly,
}: {
  id: string
  value: string | null
  onSave: (value: string) => void
  type?: string
  placeholder?: string
  saveOnBlurOnly?: boolean
}) {
  const [draft, setDraft] = useState(value ?? "")
  const saved = useRef(value ?? "")
  const save = useRef(onSave)
  useEffect(() => {
    save.current = onSave
  })

  function flush(next: string) {
    if (next.trim() === saved.current) return
    saved.current = next.trim()
    save.current(next)
  }

  useEffect(() => {
    if (saveOnBlurOnly || type === "date") return
    const timer = setTimeout(() => flush(draft), 700)
    return () => clearTimeout(timer)
  })

  return (
    <Input
      id={id}
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => {
        setDraft(event.target.value)
        if (type === "date") flush(event.target.value)
      }}
      onBlur={() => flush(draft)}
    />
  )
}

function StageTracker({ stage, onChange }: { stage: string; onChange: (stage: string) => void }) {
  const closed = stage === "not_this_time"
  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label="Stage"
        className="flex-wrap"
        value={[stage]}
        onValueChange={(next: string[]) => next[0] && onChange(next[0])}
      >
        {STAGES.filter((item) => item.key !== "not_this_time").map((item) => (
          <ToggleGroupItem key={item.key} value={item.key}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div>
        <Button variant="ghost" size="xs" onClick={() => onChange(closed ? "talking" : "not_this_time")}>
          {closed ? "Reopen this trip plan" : "Mark as not this time"}
        </Button>
        {closed && <Badge variant="outline">Not this time</Badge>}
      </div>
    </div>
  )
}

function PaymentsCard({ plan, today, save }: { plan: PlanRow; today: string; save: (fields: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState("deposit")
  const [amount, setAmount] = useState("")
  const [paidOn, setPaidOn] = useState(today)
  const [method, setMethod] = useState("")
  const [note, setNote] = useState("")
  const [recordOpen, setRecordOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const summary = summarizePayments(plan, plan.payments, today)

  function record() {
    const parsed = parseMoney(amount)
    if (parsed === null || Number.isNaN(parsed)) {
      toast.error("Enter an amount, like 3000.")
      return
    }
    startTransition(async () => {
      const result = await addPayment({
        planId: plan.id,
        kind,
        amount: parsed,
        paid_on: paidOn,
        method: method || null,
        note: note || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setAmount("")
      setMethod("")
      setNote("")
      setRecordOpen(false)
      toast.success("Payment recorded")
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePayment({ planId: plan.id, id })
      if (!result.ok) toast.error(result.error)
    })
  }

  function saveMoney(field: string, value: string) {
    const parsed = parseMoney(value)
    if (Number.isNaN(parsed)) {
      toast.error("Enter an amount, like 3000.")
      return
    }
    save({ [field]: parsed })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        <CardDescription>Logged by hand. No card or bank details belong here.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Paid</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(summary.paid)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Balance</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(summary.balance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <Badge variant={summary.overdue ? "destructive" : "secondary"}>
              {summary.overdue ? `${summary.overdue === "deposit" ? "Deposit" : "Balance"} overdue` : PAYMENT_STATUS_LABELS[summary.status]}
            </Badge>
          </div>
        </div>

        <Collapsible defaultOpen={plan.agreed_total === null}>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ml-2" />}>
            Total: {formatMoney(plan.agreed_total)}
            {plan.deposit_amount !== null ? ` · Deposit: ${formatMoney(plan.deposit_amount)}` : ""}
            {plan.balance_due_on ? ` · Balance due ${formatDate(plan.balance_due_on)}` : ""}
            <ChevronDownIcon data-icon="inline-end" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
        <FieldGroup className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="plan-total">Agreed total ($)</FieldLabel>
            <AutoSaveInput id="plan-total" value={plan.agreed_total === null ? null : String(plan.agreed_total)} saveOnBlurOnly onSave={(value) => saveMoney("agreed_total", value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-deposit">Deposit ($)</FieldLabel>
            <AutoSaveInput id="plan-deposit" value={plan.deposit_amount === null ? null : String(plan.deposit_amount)} saveOnBlurOnly onSave={(value) => saveMoney("deposit_amount", value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-deposit-due">Deposit due</FieldLabel>
            <AutoSaveInput id="plan-deposit-due" type="date" value={plan.deposit_due_on} onSave={(value) => save({ deposit_due_on: value || null })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-balance-due">Balance due</FieldLabel>
            <AutoSaveInput id="plan-balance-due" type="date" value={plan.balance_due_on} onSave={(value) => save({ balance_due_on: value || null })} />
          </Field>
        </FieldGroup>

          </CollapsibleContent>
        </Collapsible>

        {plan.payments.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...plan.payments]
                .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
                .map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paid_on)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {paymentKindLabel(payment.kind)}
                      {(payment.method || payment.note) && (
                        <p className="text-xs text-muted-foreground">{[payment.method, payment.note].filter(Boolean).join(" · ")}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {payment.kind === "refund" ? "-" : ""}
                      {formatMoney(payment.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${paymentKindLabel(payment.kind)} of ${formatMoney(payment.amount)}`} />}
                        >
                          <Trash2Icon />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this payment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Use this for a mistaken entry. If money was returned, record a refund instead. The removal is kept in the log.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => remove(payment.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
          <DialogTrigger render={<Button variant="secondary" className="self-start" />}>Record a payment</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record a payment</DialogTitle>
              <DialogDescription>For money that&apos;s already arrived or gone back.</DialogDescription>
            </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="payment-kind">Type</FieldLabel>
              <SimpleSelect
                id="payment-kind"
                items={PAYMENT_KINDS.map((item) => ({ value: item.key, label: item.label }))}
                value={kind}
                onChange={setKind}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-amount">Amount ($)</FieldLabel>
              <Input id="payment-amount" inputMode="decimal" placeholder="3000" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-date">Date received</FieldLabel>
              <Input id="payment-date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-method">How (optional)</FieldLabel>
              <Input id="payment-method" placeholder="Wire, check, Zelle" value={method} onChange={(event) => setMethod(event.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="payment-note">Note (optional)</FieldLabel>
            <Input id="payment-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div>
            <Button variant="secondary" onClick={record} disabled={isPending || !amount.trim() || !paidOn}>
              {isPending && <Spinner data-icon="inline-start" />}
              Record payment
            </Button>
          </div>
        </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function TravelersCard({ plan, people }: { plan: PlanRow; people: PersonOption[] }) {
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
    <Card>
      <CardHeader>
        <CardTitle>Who&apos;s traveling</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {[...plan.trip_plan_travelers]
            .sort((a, b) => Number(b.is_lead) - Number(a.is_lead))
            .map(({ is_lead, subscribers: traveler }) => (
              <li key={traveler.id} className="flex items-center gap-2 text-sm">
                {is_lead && <StarIcon aria-label="Lead traveler" className="size-3.5 text-chart-2" />}
                <Link href={`/subscribers/${traveler.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">
                  {personName(traveler)}
                </Link>
                {!traveler.email && <Badge variant="outline">No email</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${personName(traveler)}`}
                  disabled={isPending || plan.trip_plan_travelers.length <= 1}
                  onClick={() => run(() => removeTraveler({ planId: plan.id, subscriberId: traveler.id }))}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
        </ul>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button variant="secondary" className="self-start" />}>Add a traveler</DialogTrigger>
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
                <p className="text-xs text-muted-foreground">They won&apos;t get marketing email unless you turn it on in their profile.</p>
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
      </CardContent>
    </Card>
  )
}

function PrepCard({ plan }: { plan: PlanRow }) {
  const [isPending, startTransition] = useTransition()
  const { done, total } = prepProgress(plan.prep_done)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trip prep</CardTitle>
        <CardDescription>
          {done} of {total} done. Tick these when they&apos;re handled, and keep passport and medical details out of this app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
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
      </CardContent>
    </Card>
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
  trips: SimpleOption[]
  people: PersonOption[]
  timeline: TimelineEntry[]
  today: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const reasons = planAttention({ ...plan, trip: plan.trips }, today)
  const lead = [...plan.trip_plan_travelers].sort((a, b) => Number(b.is_lead) - Number(a.is_lead))[0]?.subscribers
  // Group departures share one itinerary. Only a custom trip has its own to track.
  const showItinerary = plan.trips?.kind !== "group"

  function save(fields: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updatePlan({ id: plan.id, ...fields })
      if (!result.ok) toast.error(result.error)
    })
  }

  function destroy() {
    startTransition(async () => {
      const result = await deletePlan(plan.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push("/pipeline")
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to pipeline" render={<Link href="/pipeline" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-48 flex-1">
          <h1 className="font-heading text-xl font-semibold">
            {lead ? (
              <Link href={`/subscribers/${lead.id}`} className="underline-offset-4 hover:underline">
                {planTitle(plan)}
              </Link>
            ) : (
              planTitle(plan)
            )}
          </h1>
          <p className="text-sm text-muted-foreground">{plan.trips?.name ?? "Trip not decided"}</p>
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {isPending ? "Saving..." : "Saved"}
        </span>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this trip plan?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes its payments and log for good. If they just decided against it, move it to Not this time instead, so you can come back to them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={destroy}>
                Delete trip plan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {reasons.length > 0 && (
        <Alert>
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {reasons.map((reason) => (
                <li key={reason.message}>{reason.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Where things stand</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-4">
                <StageTracker stage={plan.stage} onChange={(stage) => save({ stage })} />
                <Field>
                  <FieldLabel htmlFor="plan-owner">Owner</FieldLabel>
                  <SimpleSelect
                    id="plan-owner"
                    items={[{ value: NO_OWNER, label: "Nobody yet" }, ...OWNERS.map((name) => ({ value: name, label: name }))]}
                    value={plan.owner ?? NO_OWNER}
                    onChange={(owner) => save({ owner: owner === NO_OWNER ? null : owner })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="plan-trip">Trip</FieldLabel>
                  <SimpleSelect
                    id="plan-trip"
                    items={[{ value: NO_TRIP, label: "Not decided yet" }, ...trips]}
                    value={plan.trip_id ?? NO_TRIP}
                    onChange={(trip) => save({ trip_id: trip === NO_TRIP ? null : trip })}
                  />
                  {plan.trip_id && (
                    <FieldDescription>
                      <Link href={`/trips/${plan.trip_id}`}>Open this trip</Link>
                    </FieldDescription>
                  )}
                </Field>
                {plan.stage === "not_this_time" && (
                  <Field>
                    <FieldLabel htmlFor="plan-closed">Why not this time?</FieldLabel>
                    <AutoSaveInput id="plan-closed" value={plan.closed_reason} placeholder="Cost, timing, went with someone else" onSave={(closed_reason) => save({ closed_reason })} />
                  </Field>
                )}
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <Field>
                    <FieldLabel htmlFor="plan-next">Next step</FieldLabel>
                    <AutoSaveInput id="plan-next" value={plan.next_step} placeholder="Send the July itinerary" onSave={(next_step) => save({ next_step })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="plan-next-due">By</FieldLabel>
                    <AutoSaveInput id="plan-next-due" type="date" value={plan.next_step_due} onSave={(value) => save({ next_step_due: value || null })} />
                  </Field>
                </div>
                {showItinerary && (
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="plan-itinerary">Itinerary</FieldLabel>
                    <SimpleSelect
                      id="plan-itinerary"
                      items={ITINERARY_STATUSES.map((item) => ({ value: item.key, label: item.label }))}
                      value={plan.itinerary_status}
                      onChange={(itinerary_status) => save({ itinerary_status })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="plan-itinerary-url" className="flex items-center gap-1">
                      Itinerary link
                      {plan.itinerary_url && (
                        <a href={plan.itinerary_url} target="_blank" rel="noreferrer" aria-label="Open the itinerary">
                          <ExternalLinkIcon className="size-3.5" />
                        </a>
                      )}
                    </FieldLabel>
                    <AutoSaveInput
                      id="plan-itinerary-url"
                      type="url"
                      value={plan.itinerary_url}
                      placeholder="https://"
                      saveOnBlurOnly
                      onSave={(itinerary_url) => save({ itinerary_url })}
                    />
                  </Field>
                </div>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
          <TravelersCard plan={plan} people={people} />
          <PaymentsCard plan={plan} today={today} save={save} />
          {holdsSeat(plan.stage) && <PrepCard plan={plan} />}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Stage changes, payments and prep log themselves. Add calls and conversations here.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <NoteComposer planId={plan.id} />
            <ActivityTimeline entries={timeline} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
