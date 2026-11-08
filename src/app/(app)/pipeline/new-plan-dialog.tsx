"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PersonPicker, type PersonOption } from "@/components/person-picker"
import { SimpleSelect, type SimpleOption } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
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

import { createPlan } from "./actions"

const NO_TRIP = "__none__"
const NEW_TRIP = "__new__"

export function NewPlanDialog({
  people,
  trips,
  personId = null,
  defaultOwner = null,
  label = "New trip plan",
  variant = "default",
}: {
  people: PersonOption[]
  trips: SimpleOption[]
  personId?: string | null
  defaultOwner?: string | null
  label?: string
  variant?: "default" | "outline" | "ghost"
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [person, setPerson] = useState(personId)
  const [trip, setTrip] = useState(personId && trips.length === 1 ? trips[0].value : NO_TRIP)
  const [tripName, setTripName] = useState("")
  const [tripDate, setTripDate] = useState("")
  const [isPending, startTransition] = useTransition()

  function create() {
    startTransition(async () => {
      const result = await createPlan({
        subscriberId: person,
        tripId: trip === NO_TRIP || trip === NEW_TRIP ? null : trip,
        newTrip: trip === NEW_TRIP ? { name: tripName, starts_on: tripDate || null } : null,
        owner: defaultOwner,
      })
      if (!result.ok) {
        const existing = "existingId" in result ? result.existingId : null
        toast.error(result.error, existing ? { action: { label: "Open it", onClick: () => router.push(`/pipeline/${existing}`) } } : undefined)
        return
      }
      router.push(`/pipeline/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Starts at Talking. You can change the stage on the next screen.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!personId && (
            <Field>
              <FieldLabel htmlFor="plan-person">Who</FieldLabel>
              <PersonPicker id="plan-person" people={people} value={person} onChange={setPerson} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="plan-trip">Trip</FieldLabel>
            <SimpleSelect
              id="plan-trip"
              items={[{ value: NO_TRIP, label: "Not decided yet" }, ...trips, { value: NEW_TRIP, label: "A new custom safari" }]}
              value={trip}
              onChange={setTrip}
            />
          </Field>
          {trip === NEW_TRIP && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field>
                <FieldLabel htmlFor="plan-trip-name">Trip name</FieldLabel>
                <Input id="plan-trip-name" placeholder="Neal family, Serengeti 2024" value={tripName} onChange={(event) => setTripName(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-trip-date">Starts</FieldLabel>
                <Input id="plan-trip-date" type="date" value={tripDate} onChange={(event) => setTripDate(event.target.value)} />
              </Field>
            </div>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={create} disabled={!person || isPending || (trip === NEW_TRIP && !tripName.trim())}>
            {isPending && <Spinner data-icon="inline-start" />}
            Add to trip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
