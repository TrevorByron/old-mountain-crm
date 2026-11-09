"use client"

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { KanbanIcon } from "lucide-react"
import Link from "next/link"

import { ManageMenu } from "@/components/manage-menu"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { SimpleSelect, type SimpleOption } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { formatDate, planTitle, type PlanRow } from "@/lib/pipeline/display"
import {
  OWNERS,
  PAYMENT_STATUS_LABELS,
  STAGES,
  isOpenStage,
  planAttention,
  summarizePayments,
} from "@/lib/pipeline/stages"

import { updatePlan } from "./actions"
import { planActions } from "./journey-controls"

const ALL = "__all__"
const NONE = "__none__"

function PlanCard({ plan, today }: { plan: PlanRow; today: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: plan.id })
  const payment = summarizePayments(plan, plan.payments, today)
  const reasons = planAttention({ ...plan, trip: plan.trips }, today)
  const overdue = reasons.some((reason) => reason.severity === "overdue")

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "cursor-grabbing" : "cursor-grab"}
      style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 20 : undefined, position: "relative" }}
      {...attributes}
      {...listeners}
    >
      <Card size="sm" className={overdue ? "ring-2 ring-destructive" : undefined}>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-1">
            <CardTitle className="min-w-0">
              <Link href={`/pipeline/${plan.id}`} className="underline-offset-4 hover:underline">
                {planTitle(plan)}
              </Link>
            </CardTitle>
            <ManageMenu label={`Manage ${planTitle(plan)}`} actions={planActions(plan, null)} className="-mt-1 -mr-1" />
          </div>
          <p className="text-xs text-muted-foreground">
            {plan.trips?.name ?? "Trip not decided"}
            {plan.owner ? ` · ${plan.owner}` : ""}
          </p>
          {plan.next_step && (
            <p className="text-sm">
              {plan.next_step}
              {plan.next_step_due && <span className="text-muted-foreground"> · {formatDate(plan.next_step_due)}</span>}
            </p>
          )}
          {payment.status !== "no_total" && (
            <div>
              <Badge variant={payment.overdue ? "destructive" : "outline"}>
                {payment.overdue ? `${payment.overdue === "deposit" ? "Deposit" : "Balance"} overdue` : PAYMENT_STATUS_LABELS[payment.status]}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StageColumn({ stage, plans, today }: { stage: (typeof STAGES)[number]; plans: PlanRow[]; today: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.label}
      className={`flex min-h-24 min-w-0 flex-col gap-2 rounded-lg border p-2 ${isOver ? "bg-accent" : "bg-muted/40"}`}
    >
      <h2 className="flex items-center justify-between px-1 text-sm font-medium">
        {stage.label}
        <Badge variant="secondary">{plans.length}</Badge>
      </h2>
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} today={today} />
      ))}
    </section>
  )
}

export function PipelineBoard({ plans, trips, today }: { plans: PlanRow[]; trips: SimpleOption[]; today: string }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [tripFilter, setTripFilter] = useState(ALL)
  const [ownerFilter, setOwnerFilter] = useState(ALL)
  const [showFinished, setShowFinished] = useState(false)
  const [, startTransition] = useTransition()
  // Touch waits for a press-and-hold, so swiping a card scrolls the page on a phone.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const visible = useMemo(
    () =>
      plans
        .map((plan) => (overrides[plan.id] ? { ...plan, stage: overrides[plan.id] } : plan))
        .filter((plan) => {
          if (tripFilter === NONE && plan.trip_id) return false
          if (tripFilter !== ALL && tripFilter !== NONE && plan.trip_id !== tripFilter) return false
          if (ownerFilter === NONE && plan.owner) return false
          if (ownerFilter !== ALL && ownerFilter !== NONE && plan.owner !== ownerFilter) return false
          return true
        }),
    [plans, overrides, tripFilter, ownerFilter]
  )

  const finishedCount = visible.filter((plan) => !isOpenStage(plan.stage)).length
  const stages = STAGES.filter((stage) => showFinished || isOpenStage(stage.key))

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return
    const id = String(active.id)
    const stage = String(over.id)
    const current = overrides[id] ?? plans.find((plan) => plan.id === id)?.stage
    if (current === stage) return

    setOverrides((previous) => ({ ...previous, [id]: stage }))
    startTransition(async () => {
      const result = await updatePlan({ id, stage })
      if (!result.ok) {
        toast.error(result.error)
        setOverrides((previous) => {
          const next = { ...previous }
          delete next[id]
          return next
        })
      }
    })
  }

  if (plans.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KanbanIcon />
          </EmptyMedia>
          <EmptyTitle>No trip plans yet</EmptyTitle>
          <EmptyDescription>Start one when a conversation turns serious, or to log a safari someone has already taken.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect
          label="Filter by trip"
          className="w-48"
          items={[{ value: ALL, label: "All trips" }, ...trips, { value: NONE, label: "Trip not decided" }]}
          value={tripFilter}
          onChange={setTripFilter}
        />
        <SimpleSelect
          label="Filter by owner"
          className="w-40"
          items={[
            { value: ALL, label: "All owners" },
            ...OWNERS.map((name) => ({ value: name, label: name })),
            { value: NONE, label: "No owner" },
          ]}
          value={ownerFilter}
          onChange={setOwnerFilter}
        />
        <div className="flex items-center gap-2 sm:ml-auto">
          <Checkbox id="show-finished" checked={showFinished} onCheckedChange={(checked) => setShowFinished(Boolean(checked))} />
          <Label htmlFor="show-finished">Show finished ({finishedCount})</Label>
        </div>
      </div>

      <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3 pb-4">
          {stages.map((stage) => (
            <StageColumn key={stage.key} stage={stage} plans={visible.filter((plan) => plan.stage === stage.key)} today={today} />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
