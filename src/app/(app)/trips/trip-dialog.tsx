"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

import { saveTrip } from "./actions"

// Only the name is needed to start. Everything else fills in on the trip's own page.
export function TripDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveTrip({
        id: null,
        name: formData.get("name"),
        kind: "group",
        seats: null,
        price_per_person: null,
        deposit_per_person: null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      router.push(`/trips/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New trip</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New trip</DialogTitle>
          <DialogDescription>Add dates, seats and price on the next screen.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="trip-name">Name</FieldLabel>
            <Input id="trip-name" name="name" required placeholder="Northern Circuit, February 2028" />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Create trip
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
