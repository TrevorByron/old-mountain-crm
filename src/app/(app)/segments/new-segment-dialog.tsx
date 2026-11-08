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

export function NewSegmentDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

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
          <DialogDescription>Name the group. You&apos;ll choose who belongs in it next.</DialogDescription>
        </DialogHeader>
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
