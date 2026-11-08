"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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

import { createSegment } from "./actions"

const STARTERS = [
  { name: "Past guests", description: "Everyone who's traveled with you", rules: { lifecycles: ["past_guest"] } },
  { name: "In conversation", description: "Anyone with an open trip plan who hasn't committed", rules: { lifecycles: ["prospect"] } },
  { name: "Booked guests", description: "Committed to an upcoming trip", rules: { lifecycles: ["customer"] } },
  { name: "Not this time", description: "People who passed, worth trying again", rules: { plan_stages: ["not_this_time"] } },
]

export function NewSegmentDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function startFrom(starter: (typeof STARTERS)[number]) {
    startTransition(async () => {
      const result = await createSegment(starter)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/segments/${result.id}`)
    })
  }

  function create(formData: FormData) {
    startTransition(async () => {
      const result = await createSegment({ name: formData.get("name"), description: formData.get("description") })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/segments/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New segment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New segment</DialogTitle>
          <DialogDescription>Start with a common one, or name your own and choose who belongs next.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {STARTERS.map((starter) => (
            <Button
              key={starter.name}
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
              disabled={isPending}
              onClick={() => startFrom(starter)}
            >
              <span className="font-medium">{starter.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{starter.description}</span>
            </Button>
          ))}
        </div>
        <form action={create} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="segment-name">Name</FieldLabel>
              <Input id="segment-name" name="name" placeholder="Interested in a 2027 safari" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="segment-description">Description (optional)</FieldLabel>
              <Input id="segment-description" name="description" placeholder="Anyone who picked a 2027 departure" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Create segment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
