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
import { OWNERS, STAGES } from "@/lib/pipeline/stages"

import { createPlan } from "./actions"

const NO_TRIP = "__none__"
const NEW_TRIP = "__new__"
const NO_OWNER = "__none__"

export function NewPlanDialog({
  people,
  trips,
  personId = null,
  defaultOwner = null,
  label = "New trip plan",
}: {
  people: PersonOption[]
  trips: SimpleOption[]
  personId?: string | null
  defaultOwner?: string | null
  label?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [person, setPerson] = useState(personId)
  const [trip, setTrip] = useState(NO_TRIP)
  const [tripName, setTripName] = useState("")
  const [tripDate, setTripDate] = useState("")
  const [stage, setStage] = useState("talking")
  const [owner, setOwner] = useState(defaultOwner && OWNERS.includes(defaultOwner) ? defaultOwner : NO_OWNER)
  const [isPending, startTransition] = useTransition()

  function create() {
    startTransition(async () => {
      const result = await createPlan({
        subscriberId: person,
        tripId: trip === NO_TRIP || trip === NEW_TRIP ? null : trip,
        newTrip: trip === NEW_TRIP ? { name: tripName, starts_on: tripDate || null } : null,
        stage,
        owner: owner === NO_OWNER ? null : owner,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/pipeline/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New trip plan</DialogTitle>
          <DialogDescription>Follows one person or group pursuing one trip. To log a safari they&apos;ve already taken, set the stage to Traveled.</DialogDescription>
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
          <Field>
            <FieldLabel htmlFor="plan-stage">Stage</FieldLabel>
            <SimpleSelect
              id="plan-stage"
              items={STAGES.map((item) => ({ value: item.key, label: item.label }))}
              value={stage}
              onChange={setStage}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-owner">Owner</FieldLabel>
            <SimpleSelect
              id="plan-owner"
              items={[{ value: NO_OWNER, label: "Nobody yet" }, ...OWNERS.map((name) => ({ value: name, label: name }))]}
              value={owner}
              onChange={setOwner}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={create} disabled={!person || isPending || (trip === NEW_TRIP && !tripName.trim())}>
            {isPending && <Spinner data-icon="inline-start" />}
            Start trip plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
