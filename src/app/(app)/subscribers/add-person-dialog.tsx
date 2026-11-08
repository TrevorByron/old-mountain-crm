"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

import { createPerson } from "./actions"

export function AddPersonDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createPerson({
        first_name: formData.get("first_name"),
        last_name: formData.get("last_name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        source: formData.get("source"),
        marketing_ok: marketing,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/subscribers/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add person</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>Someone you met, a referral, or a past guest who never filled in the form.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup className="gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="person-first">First name</FieldLabel>
                <Input id="person-first" name="first_name" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="person-last">Last name</FieldLabel>
                <Input id="person-last" name="last_name" />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="person-email">Email (optional)</FieldLabel>
              <Input id="person-email" name="email" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="person-phone">Phone (optional)</FieldLabel>
              <Input id="person-phone" name="phone" type="tel" />
            </Field>
            <Field>
              <FieldLabel htmlFor="person-source">How you know them (optional)</FieldLabel>
              <Input id="person-source" name="source" placeholder="Met at the Asheville talk" />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox id="person-marketing-new" checked={marketing} onCheckedChange={(checked) => setMarketing(Boolean(checked))} />
              <Label htmlFor="person-marketing-new">They&apos;ve agreed to marketing email</Label>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Add person
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
