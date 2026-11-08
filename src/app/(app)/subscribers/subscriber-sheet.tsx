"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

import { markUnsubscribed, updateSubscriber } from "./actions"
import { fullName, type Subscriber } from "./subscriber-table"

export function SubscriberSheet({
  subscriber,
  statuses,
  onClose,
}: {
  subscriber: Subscriber | null
  statuses: string[]
  onClose: () => void
}) {
  return (
    <Sheet open={subscriber !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {subscriber && (
          <SubscriberForm key={subscriber.id} subscriber={subscriber} statuses={statuses} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SubscriberForm({
  subscriber,
  statuses,
  onClose,
}: {
  subscriber: Subscriber
  statuses: string[]
  onClose: () => void
}) {
  const [status, setStatus] = useState<string | null>(subscriber.status)
  const [isPending, startTransition] = useTransition()
  const optedOut = Boolean(subscriber.unsubscribed_at) || subscriber.suppressed

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await updateSubscriber({
        id: subscriber.id,
        email: formData.get("email"),
        first_name: formData.get("first_name"),
        last_name: formData.get("last_name"),
        country: formData.get("country"),
        phone: formData.get("phone"),
        status,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Subscriber saved", { description: result.warning })
      onClose()
    })
  }

  function unsubscribe() {
    startTransition(async () => {
      const result = await markUnsubscribed(subscriber.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Unsubscribed")
      onClose()
    })
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{fullName(subscriber) || subscriber.email || "No name"}</SheetTitle>
        <SheetDescription>Changes to name, email and phone also update Airtable, for people who came from it.</SheetDescription>
      </SheetHeader>
      <form action={save} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
        {optedOut && (
          <Alert>
            <AlertDescription>
              {subscriber.suppressed
                ? `Suppressed (${subscriber.suppressed_reason?.replace("_", " ")}). They won't receive email.`
                : "Unsubscribed. They won't receive email, and syncs or signups can't re-subscribe them."}
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="first_name">First name</FieldLabel>
            <Input id="first_name" name="first_name" defaultValue={subscriber.first_name ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="last_name">Last name</FieldLabel>
            <Input id="last_name" name="last_name" defaultValue={subscriber.last_name ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" defaultValue={subscriber.email ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" name="phone" type="tel" defaultValue={subscriber.phone ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="status">Status</FieldLabel>
            <Select
              items={statuses.map((value) => ({ label: value, value }))}
              value={status}
              onValueChange={setStatus}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="No status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <Input id="country" name="country" defaultValue={subscriber.country ?? ""} />
          </Field>
        </FieldGroup>
        <SheetFooter className="mt-auto px-0">
          <Button type="submit" disabled={isPending}>
            {isPending && <Spinner data-icon="inline-start" />}
            Save changes
          </Button>
          {subscriber.email && !subscriber.unsubscribed_at && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={isPending} />}>
                Unsubscribe
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unsubscribe {subscriber.email}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They&apos;ll stop receiving email right away. This can&apos;t be undone from the app.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={unsubscribe}>
                    Unsubscribe
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SheetFooter>
      </form>
    </>
  )
}
