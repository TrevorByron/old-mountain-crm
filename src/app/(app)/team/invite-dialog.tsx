"use client"

import { PlusIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Fab } from "@/components/fab"
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

import { inviteMember } from "./actions"

export function InviteDialog({ fab = false }: { fab?: boolean }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function invite(formData: FormData) {
    startTransition(async () => {
      const result = await inviteMember({ email: formData.get("email"), name: formData.get("name") })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.warning) toast.warning(result.warning)
      else toast.success("Invite sent")
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={fab ? <Fab aria-label="Invite teammate" /> : <Button />}>{fab ? <PlusIcon /> : <><PlusIcon data-icon="inline-start" />Invite teammate</>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link to sign in, with full admin access.</DialogDescription>
        </DialogHeader>
        <form action={invite} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-name">Name</FieldLabel>
              <Input id="invite-name" name="name" placeholder="Heather" />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input id="invite-email" name="email" type="email" required />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
