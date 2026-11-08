"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

import { saveTrip } from "./actions"

export type TripFields = {
  id: string
  name: string
  kind: string
  starts_on: string | null
  ends_on: string | null
  seats: number | null
  price_per_person: number | null
  deposit_per_person: number | null
  balance_due_on: string | null
  notes: string | null
  archived: boolean
}

const toNumber = (value: FormDataEntryValue | null) => {
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "")
  return cleaned ? Number(cleaned) : null
}

export function TripDialog({ trip }: { trip?: TripFields }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState(trip?.kind ?? "group")
  const [archived, setArchived] = useState(trip?.archived ?? false)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    const numbers = [toNumber(formData.get("seats")), toNumber(formData.get("price")), toNumber(formData.get("deposit"))]
    if (numbers.some((value) => value !== null && Number.isNaN(value))) {
      toast.error("Seats and amounts need to be numbers.")
      return
    }
    startTransition(async () => {
      const result = await saveTrip({
        id: trip?.id ?? null,
        name: formData.get("name"),
        kind,
        starts_on: formData.get("starts_on"),
        ends_on: formData.get("ends_on"),
        seats: numbers[0],
        price_per_person: numbers[1],
        deposit_per_person: numbers[2],
        balance_due_on: formData.get("balance_due_on"),
        notes: formData.get("notes"),
        archived,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      if (!trip) router.push(`/trips/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={trip ? "outline" : "default"} />}>{trip ? "Edit trip" : "New trip"}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trip ? "Edit trip" : "New trip"}</DialogTitle>
          <DialogDescription>A departure or custom safari. Price and terms fill in new trip plans, which you can then adjust.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="trip-name">Name</FieldLabel>
              <Input id="trip-name" name="name" required defaultValue={trip?.name} placeholder="Northern Circuit, February 2028" />
            </Field>
            <Field>
              <FieldLabel htmlFor="trip-kind">Kind</FieldLabel>
              <SimpleSelect
                id="trip-kind"
                items={[
                  { value: "group", label: "Group departure" },
                  { value: "custom", label: "Custom safari" },
                ]}
                value={kind}
                onChange={setKind}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="trip-start">Starts</FieldLabel>
                <Input id="trip-start" name="starts_on" type="date" defaultValue={trip?.starts_on ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="trip-end">Ends</FieldLabel>
                <Input id="trip-end" name="ends_on" type="date" defaultValue={trip?.ends_on ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="trip-seats">Seats</FieldLabel>
                <Input id="trip-seats" name="seats" inputMode="numeric" defaultValue={trip?.seats ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="trip-price">Price per person ($)</FieldLabel>
                <Input id="trip-price" name="price" inputMode="decimal" defaultValue={trip?.price_per_person ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="trip-deposit">Deposit per person ($)</FieldLabel>
                <Input id="trip-deposit" name="deposit" inputMode="decimal" defaultValue={trip?.deposit_per_person ?? ""} />
              </Field>
              <Field>
                <FieldLabel htmlFor="trip-balance">Balance due</FieldLabel>
                <Input id="trip-balance" name="balance_due_on" type="date" defaultValue={trip?.balance_due_on ?? ""} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="trip-notes">Notes</FieldLabel>
              <Textarea id="trip-notes" name="notes" rows={2} defaultValue={trip?.notes ?? ""} />
            </Field>
            {trip && (
              <Field>
                <div className="flex items-center gap-2">
                  <Checkbox id="trip-archived" checked={archived} onCheckedChange={(checked) => setArchived(Boolean(checked))} />
                  <Label htmlFor="trip-archived">Archived</Label>
                </div>
                <FieldDescription>Hides it when starting new trip plans. Its history stays.</FieldDescription>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Save trip
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
