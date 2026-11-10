"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
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
import { DEFAULT_SEGMENT_COLOR, type SegmentColor } from "@/lib/segments/colors"

import { createSegment } from "./actions"
import { SegmentColorPicker } from "./segment-color-picker"

const STARTERS: { name: string; rules: Record<string, string[]> }[] = [
  { name: "Past guests", rules: { lifecycles: ["past_guest"] } },
  { name: "In conversation", rules: { lifecycles: ["prospect"] } },
  { name: "Booked guests", rules: { lifecycles: ["customer"] } },
  { name: "Not this time", rules: { plan_stages: ["not_this_time"] } },
]

// Name it and pick a color. Who's in it is chosen on the segment's own page, next.
function NewSegmentForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [color, setColor] = useState<SegmentColor>(DEFAULT_SEGMENT_COLOR)
  const [isPending, startTransition] = useTransition()

  function create(input: { name: string; rules?: Record<string, string[]> }) {
    startTransition(async () => {
      const result = await createSegment({ ...input, color })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/segments/${result.id}`)
    })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        create({ name })
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="segment-name">Name</FieldLabel>
          <Input id="segment-name" placeholder="Interested in a 2027 safari" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <Field>
          <FieldLabel>Color</FieldLabel>
          <SegmentColorPicker value={color} onChange={setColor} disabled={isPending} />
        </Field>
        <Field>
          <FieldLabel>Or start from a common one</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <Button key={starter.name} type="button" variant="outline" size="sm" disabled={isPending} onClick={() => create(starter)}>
                {starter.name}
              </Button>
            ))}
          </div>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export function NewSegmentDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>New segment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new segment</DialogTitle>
          <DialogDescription>Next you&apos;ll choose who&apos;s in it, by rules or by adding people.</DialogDescription>
        </DialogHeader>
        <NewSegmentForm />
      </DialogContent>
    </Dialog>
  )
}
