"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { InlineText } from "@/components/inline-edit"
import { ManageMenu, type ManageAction } from "@/components/manage-menu"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { ItineraryDay } from "@/lib/trips/itinerary"

import { addItineraryDay, clearItinerary, moveItineraryDay, pullItineraryFromWebsite, removeItineraryDay, updateItineraryDay } from "./actions"

export type ItineraryRow = ItineraryDay & { id: string }

function DayRow({ tripId, day, first, last }: { tripId: string; day: ItineraryRow; first: boolean; last: boolean }) {
  const save = (fields: Partial<ItineraryDay>) => updateItineraryDay({ id: day.id, tripId, ...fields })
  const name = day.title || day.label || "this day"

  return (
    <div className="grid items-start gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
      <InlineText label="Which days" value={day.label} placeholder="Day" className="text-muted-foreground" onSave={(label) => save({ label })} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <InlineText label="Day title" value={day.title} placeholder="Add a title" className="font-medium" onSave={(title) => save({ title })} />
        <InlineText label="What happens" multiline rows={2} value={day.description} placeholder="What happens" className="text-muted-foreground" onSave={(description) => save({ description })} />
        <InlineText label="Where they stay" value={day.stay} placeholder="Where they stay" className="text-xs text-muted-foreground" onSave={(stay) => save({ stay })} />
      </div>
      <ManageMenu
        label={`Manage ${name}`}
        actions={[
          { label: "Move up", hidden: first, run: () => moveItineraryDay({ id: day.id, tripId, direction: -1 }) },
          { label: "Move down", hidden: last, run: () => moveItineraryDay({ id: day.id, tripId, direction: 1 }) },
          {
            label: "Remove day",
            title: `Remove ${name}?`,
            description: "This takes it off the itinerary for good.",
            destructive: true,
            success: "Day removed",
            run: () => removeItineraryDay({ id: day.id, tripId }),
          },
        ]}
      />
    </div>
  )
}

export function ItinerarySection({ tripId, canPull, days }: { tripId: string; canPull: boolean; days: ItineraryRow[] }) {
  const [pending, setPending] = useState<"pull" | "add" | null>(null)
  const [, startTransition] = useTransition()

  function run(which: "pull" | "add", action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setPending(which)
    startTransition(async () => {
      const result = await action()
      setPending(null)
      if (!result.ok) toast.error(result.error ?? "That didn't work.")
      else if (success) toast.success(success)
    })
  }

  const pull = () => pullItineraryFromWebsite(tripId)
  const menu: ManageAction[] = [
    {
      label: "Pull from website",
      title: "Replace this with the website's itinerary?",
      description: "Every day here is replaced by the journey on old-mountain.com, including any edits you've made.",
      success: "Itinerary pulled from the website",
      hidden: !canPull,
      run: pull,
    },
    {
      label: "Clear itinerary",
      title: "Clear the whole itinerary?",
      description: "Removes every day from this trip for good.",
      destructive: true,
      success: "Itinerary cleared",
      run: () => clearItinerary(tripId),
    },
  ]

  const addButton = (
    <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => run("add", () => addItineraryDay(tripId))}>
      {pending === "add" && <Spinner data-icon="inline-start" />}
      Add a day
    </Button>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Itinerary</CardTitle>
        {days.length > 0 && (
          <CardAction>
            <ManageMenu label="Manage the itinerary" actions={menu} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {days.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {canPull ? "Pull the day-by-day plan from your website, or type it in yourself." : "Add the day-by-day plan for this trip."}
            </p>
            <div className="flex flex-wrap gap-2">
              {canPull && (
                <Button size="sm" disabled={pending !== null} onClick={() => run("pull", pull, "Itinerary pulled from the website")}>
                  {pending === "pull" && <Spinner data-icon="inline-start" />}
                  Pull from website
                </Button>
              )}
              {addButton}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col divide-y">
              {days.map((day, index) => (
                <DayRow key={day.id} tripId={tripId} day={day} first={index === 0} last={index === days.length - 1} />
              ))}
            </div>
            <div>{addButton}</div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
